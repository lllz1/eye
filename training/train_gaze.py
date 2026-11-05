from __future__ import annotations

import argparse
import json
import math
import pathlib
import random

import h5py
import numpy as np
import torch
import torch.nn.functional as F
from torch import nn
from torch.utils.data import DataLoader, Dataset


class BasicBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, stride: int) -> None:
        super().__init__()
        self.bn1 = nn.BatchNorm2d(in_channels)
        self.conv1 = nn.Conv2d(
            in_channels, out_channels, 3, stride=stride, padding=1, bias=False
        )
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(
            out_channels, out_channels, 3, stride=1, padding=1, bias=False
        )
        self.shortcut = nn.Sequential()
        if in_channels != out_channels:
            self.shortcut.add_module(
                'conv',
                nn.Conv2d(
                    in_channels, out_channels, 1, stride=stride, padding=0, bias=False
                ),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.bn1(x), inplace=True)
        y = self.conv1(x)
        y = F.relu(self.bn2(y), inplace=True)
        y = self.conv2(y)
        return y + self.shortcut(x)


class GazeResNet8(nn.Module):
    """ResNet-preact-8 from the MPIIGaze baseline."""

    def __init__(self) -> None:
        super().__init__()
        base = 16
        blocks = 1
        channels = [base, base * 2, base * 4]
        self.conv = nn.Conv2d(1, channels[0], 3, 1, 1, bias=False)
        self.stage1 = self._make_stage(channels[0], channels[0], blocks, 1)
        self.stage2 = self._make_stage(channels[0], channels[1], blocks, 2)
        self.stage3 = self._make_stage(channels[1], channels[2], blocks, 2)
        self.bn = nn.BatchNorm2d(channels[2])
        with torch.no_grad():
            feature_size = self._forward_conv(torch.zeros(1, 1, 36, 60)).view(-1).size(0)
        self.fc = nn.Linear(feature_size + 2, 2)
        self.apply(self._init_weights)

    @staticmethod
    def _make_stage(
        in_channels: int, out_channels: int, blocks: int, stride: int
    ) -> nn.Sequential:
        stage = nn.Sequential()
        for index in range(blocks):
            stage.add_module(
                f'block{index + 1}',
                BasicBlock(
                    in_channels if index == 0 else out_channels,
                    out_channels,
                    stride if index == 0 else 1,
                ),
            )
        return stage

    def _forward_conv(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stage1(self.conv(x))
        x = self.stage2(x)
        x = self.stage3(x)
        return F.adaptive_avg_pool2d(F.relu(self.bn(x), inplace=True), 1)

    def forward(self, eye: torch.Tensor, pose: torch.Tensor) -> torch.Tensor:
        x = self._forward_conv(eye).view(eye.size(0), -1)
        return self.fc(torch.cat([x, pose], dim=1))

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Conv2d):
            nn.init.kaiming_normal_(module.weight, mode='fan_out')
        elif isinstance(module, nn.BatchNorm2d):
            nn.init.ones_(module.weight)
            nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Linear):
            nn.init.zeros_(module.bias)


class MPIIGazeDataset(Dataset):
    def __init__(self, h5_path: pathlib.Path, people: list[str], augment: bool) -> None:
        self.images: list[np.ndarray] = []
        self.poses: list[np.ndarray] = []
        self.gazes: list[np.ndarray] = []
        self.augment = augment
        with h5py.File(h5_path, 'r') as handle:
            for person in people:
                self.images.append(handle[f'{person}/image'][()])
                self.poses.append(handle[f'{person}/pose'][()])
                self.gazes.append(handle[f'{person}/gaze'][()])
        self.images = np.concatenate(self.images, axis=0)
        self.poses = np.concatenate(self.poses, axis=0).astype(np.float32)
        self.gazes = np.concatenate(self.gazes, axis=0).astype(np.float32)

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int):
        image = self.images[index].astype(np.float32) / 255.0
        if self.augment:
            gain = random.uniform(0.78, 1.22)
            bias = random.uniform(-0.08, 0.08)
            image = np.clip(image * gain + bias, 0.0, 1.0)
            if random.random() < 0.18:
                image = np.clip(image + np.random.normal(0, 0.015, image.shape), 0, 1)
        eye = torch.from_numpy(
            np.ascontiguousarray(image, dtype=np.float32)
        ).unsqueeze(0)
        pose = torch.from_numpy(
            np.ascontiguousarray(self.poses[index], dtype=np.float32)
        )
        gaze = torch.from_numpy(
            np.ascontiguousarray(self.gazes[index], dtype=np.float32)
        )
        return eye, pose, gaze


def gaze_to_vector(gaze: torch.Tensor) -> torch.Tensor:
    pitch = gaze[:, 0]
    yaw = gaze[:, 1]
    cos_pitch = torch.cos(pitch)
    return torch.stack(
        [-cos_pitch * torch.sin(yaw), -torch.sin(pitch), -cos_pitch * torch.cos(yaw)],
        dim=1,
    )


def angular_error(prediction: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    pred_vec = gaze_to_vector(prediction)
    target_vec = gaze_to_vector(target)
    cosine = F.cosine_similarity(pred_vec, target_vec, dim=1).clamp(-1.0, 1.0)
    return torch.acos(cosine) * (180.0 / math.pi)


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    optimizer: torch.optim.Optimizer | None,
    scaler: torch.amp.GradScaler | None,
) -> tuple[float, float]:
    training = optimizer is not None
    model.train(training)
    total_loss = 0.0
    total_angle = 0.0
    total_samples = 0
    for eye, pose, gaze in loader:
        eye = eye.to(device, non_blocking=True)
        pose = pose.to(device, non_blocking=True)
        gaze = gaze.to(device, non_blocking=True)
        with torch.set_grad_enabled(training):
            with torch.autocast(
                device_type=device.type, dtype=torch.float16, enabled=device.type == 'cuda'
            ):
                prediction = model(eye, pose)
                loss = F.mse_loss(prediction, gaze)
            if training:
                optimizer.zero_grad(set_to_none=True)
                if scaler is not None:
                    scaler.scale(loss).backward()
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    loss.backward()
                    optimizer.step()
        with torch.no_grad():
            angle = angular_error(prediction.float(), gaze).mean()
        batch = eye.size(0)
        total_loss += loss.item() * batch
        total_angle += angle.item() * batch
        total_samples += batch
    return total_loss / total_samples, total_angle / total_samples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--h5', default='training/datasets/MPIIGaze.h5')
    parser.add_argument('--out', default='training/checkpoints')
    parser.add_argument('--epochs', type=int, default=34)
    parser.add_argument('--batch-size', type=int, default=128)
    parser.add_argument('--test-person', default='p00')
    parser.add_argument('--val-person', default='p01')
    args = parser.parse_args()

    random.seed(7)
    np.random.seed(7)
    torch.manual_seed(7)
    torch.backends.cudnn.benchmark = True

    people = [f'p{index:02d}' for index in range(15)]
    val_person = args.val_person
    test_person = args.test_person
    train_people = [p for p in people if p not in {val_person, test_person}]
    print(f'train={len(train_people)} people, val={val_person}, test={test_person}')

    train_set = MPIIGazeDataset(pathlib.Path(args.h5), train_people, augment=True)
    val_set = MPIIGazeDataset(pathlib.Path(args.h5), [val_person], augment=False)
    test_set = MPIIGazeDataset(pathlib.Path(args.h5), [test_person], augment=False)
    train_loader = DataLoader(
        train_set, batch_size=args.batch_size, shuffle=True, num_workers=0, pin_memory=True
    )
    val_loader = DataLoader(
        val_set, batch_size=args.batch_size, shuffle=False, num_workers=0, pin_memory=True
    )
    test_loader = DataLoader(
        test_set, batch_size=args.batch_size, shuffle=False, num_workers=0, pin_memory=True
    )

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print('device:', device)
    if device.type == 'cuda':
        print('gpu:', torch.cuda.get_device_name(0))
    model = GazeResNet8().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1.2e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.amp.GradScaler('cuda') if device.type == 'cuda' else None

    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    best_angle = float('inf')
    history = []
    for epoch in range(1, args.epochs + 1):
        train_loss, train_angle = run_epoch(model, train_loader, device, optimizer, scaler)
        val_loss, val_angle = run_epoch(model, val_loader, device, None, None)
        scheduler.step()
        history.append(
            {
                'epoch': epoch,
                'train_loss': train_loss,
                'train_angle': train_angle,
                'val_loss': val_loss,
                'val_angle': val_angle,
                'lr': optimizer.param_groups[0]['lr'],
            }
        )
        print(
            f'epoch {epoch:02d}/{args.epochs} train_loss={train_loss:.5f} '
            f'train_angle={train_angle:.2f} val_loss={val_loss:.5f} val_angle={val_angle:.2f}'
        )
        if val_angle < best_angle:
            best_angle = val_angle
            torch.save(model.state_dict(), out_dir / 'gaze_resnet8_best.pt')

    model.load_state_dict(torch.load(out_dir / 'gaze_resnet8_best.pt', map_location=device))
    test_loss, test_angle = run_epoch(model, test_loader, device, None, None)
    metrics = {
        'test_person': test_person,
        'val_person': val_person,
        'best_val_angle_deg': best_angle,
        'test_loss': test_loss,
        'test_angle_deg': test_angle,
        'train_samples': len(train_set),
        'val_samples': len(val_set),
        'test_samples': len(test_set),
        'history': history,
    }
    (out_dir / 'metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    print('test:', metrics)

    model.eval()
    example_eye = torch.randn(1, 1, 36, 60, device=device)
    example_pose = torch.zeros(1, 2, device=device)
    onnx_path = out_dir / 'gaze_resnet8.onnx'
    torch.onnx.export(
        model,
        (example_eye, example_pose),
        onnx_path,
        input_names=['eye', 'pose'],
        output_names=['gaze'],
        dynamic_axes={
            'eye': {0: 'batch'},
            'pose': {0: 'batch'},
            'gaze': {0: 'batch'},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    print('exported:', onnx_path)


if __name__ == '__main__':
    main()
