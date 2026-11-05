# Gaze model training

This folder contains the local training pipeline for the webcam gaze model.

## Dataset

- **MPIIGaze** (Appearance-based Gaze Estimation in the Wild)
- 15 participants, 3,000 evaluation samples per participant
- Eye patches: 36 × 60 grayscale
- Official dataset: `https://datasets.d2.mpi-inf.mpg.de/MPIIGaze/MPIIGaze.tar.gz`
- Research use only. Cite Zhang et al., CVPR 2015 and the MPIIGaze TPAMI paper.

## Reproduce

```powershell
# Create the Python environment
uv venv training/.venv --python 3.12
uv pip install --python training/.venv/Scripts/python.exe torch torchvision --index-url https://download.pytorch.org/whl/cu128
uv pip install --python training/.venv/Scripts/python.exe opencv-python-headless h5py scipy pandas tqdm onnx onnxruntime

# Download and extract MPIIGaze
mkdir training/datasets
curl.exe -L -o training/datasets/MPIIGaze.tar.gz https://datasets.d2.mpi-inf.mpg.de/MPIIGaze/MPIIGaze.tar.gz
tar -xzf training/datasets/MPIIGaze.tar.gz -C training/datasets

# Convert .mat files to the compact HDF5 training set
training/.venv/Scripts/python.exe training/pytorch_mpiigaze/tools/preprocess_mpiigaze.py `
  --dataset training/datasets/MPIIGaze --output-dir training/datasets

# Train ResNet-preact-8 and export ONNX
training/.venv/Scripts/python.exe training/train_gaze.py --epochs 26 --out training/checkpoints
```

## Result

The checked-in `metrics.json` is from the run used by the app:

- Held-out participant: `p00`
- Mean angular error: **3.95°**
- Validation participant: `p01`
- Best validation angular error: **4.50°**
- Training samples: 39,000

The exported ONNX model is copied to `public/models/gaze_resnet8.onnx`.

## Web inference

The browser uses `onnxruntime-web/wasm`. At runtime it crops and aligns both eye regions with MediaPipe landmarks, converts them to 36 × 60 grayscale patches, and feeds the model the head pitch/yaw. The resulting gaze direction is added to the nine-point calibration features, so the final screen position still adapts to the individual user.

The model is a coarse gaze-direction estimator, not a medical eye tracker. Personal calibration, good lighting, and a stable head position remain important.
