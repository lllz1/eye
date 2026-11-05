# 目光所至 · Gaze Canvas

一个用普通摄像头完成「注视表达」和「注视绘画」的 Web 原型。

## 功能

- MediaPipe Face Landmarker 面部/虹膜关键点追踪
- MPIIGaze 训练的 ResNet-8 视线方向模型（留出受试者测试误差 3.95°）
- 九点个体校准，使用多项式岭回归把眼部特征映射到屏幕坐标
- One Euro 平滑与置信度门控
- 注视停留 0.8 秒选择，带环形进度反馈
- 表达板：选择常用短语并调用浏览器语音朗读
- 绘画模式：用目光移动留下轨迹，支持颜色、笔触、撤销、清空和 PNG 导出
- 演示模式：没有摄像头时用鼠标位置模拟注视
- 所有视频和校准数据留在本机，不上传服务器

## 启动

需要 Node.js 20 以上。

```powershell
cd "C:\Users\lzz\Desktop\GazeCanvas"
npm install
npm run build
npm run preview -- --host 127.0.0.1 --open
```

也可以双击项目里的 `启动.bat`，或桌面上的「目光所至」快捷方式。

浏览器打开后：

1. 点击「开启摄像头体验」，允许摄像头权限。
2. 等待视觉模型加载完成。
3. 按提示完成九点校准。
4. 注视表达板卡片约 0.8 秒即可选择。

如果没有摄像头，点击「先看演示模式」，鼠标移动会模拟注视点。

## 目录

```text
src/
  App.tsx                    主界面和状态
  components/                表达板、绘画、校准、注视光标
  hooks/useGazeTracker.ts    摄像头、模型推理、校准、平滑
  hooks/useDwellClick.ts     停留点击
  lib/faceLandmarker.ts      MediaPipe 初始化和眼部特征提取
  lib/calibration.ts         多项式岭回归和本地保存
  lib/oneEuro.ts             注视点平滑
public/
  models/face_landmarker.task
  mediapipe/wasm/            MediaPipe 本地 WASM 文件
```

## 技术说明

摄像头画面通过 `getUserMedia` 获取，MediaPipe 在浏览器本地运行。每帧提取左右虹膜中心、眼角、上下眼睑和面部中心，计算眼部相对坐标、头部偏转和眨眼程度。九点校准后，用二次多项式加岭回归预测屏幕坐标，再由 One Euro 滤波器平滑。

网页同时用 MediaPipe 关键点裁出左右眼区域，送入在 MPIIGaze 上训练的 ResNet-8 ONNX 模型，得到头部坐标系下的视线方向。该方向作为额外特征参与九点校准，弥补单纯虹膜位置对光照、眼型和头动不稳定的问题。训练和复现命令见 `training/README.md`。

普通摄像头的注视估计精度通常只有几度视角，适合大按钮和低频操作，不适合精细文字或医疗级眼动追踪。实际使用时需要均匀光线、摄像头与视线大致齐平，并在头部位置变化后重新校准。

## 比赛演示建议

1. 先展示首页和「视频只在本地处理」。
2. 开启摄像头，完成九点校准。
3. 只用目光选择「我需要帮助」，让浏览器朗读。
4. 切换到绘画，用目光画出两三笔。
5. 如果现场摄像头条件不好，立刻切到演示模式，保证交互链路完整。
