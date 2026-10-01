# UOOC Video Watcher（改进版）

用于优课在线 UOOC 的浏览器扩展，提供视频状态监控、提醒和按目录顺序切换视频。本仓库基于原项目 Fork，当前扩展版本为 **0.7.0**。

## 项目来源与署名

| 角色 | GitHub 主页 | 贡献说明 |
| --- | --- | --- |
| 原作者 | [liguanlin1212](https://github.com/liguanlin1212) | 创建原项目，提供扩展基础代码、视频监控、提醒界面及原版说明与截图。 |
| Fork 维护者与功能改进 | [Ecli（@zachary-a）](https://github.com/zachary-a) | 维护本改进版，增加自动切换、随机等待、跨小节与跨章节切换，并补充测试和版本回退说明。 |

- 原项目：[liguanlin1212/uooc-video-watcher-extension](https://github.com/liguanlin1212/uooc-video-watcher-extension)
- 本改进版：[zachary-a/uooc-video-watcher-extension](https://github.com/zachary-a/uooc-video-watcher-extension)

感谢原作者提供的基础项目。以下安装和界面截图沿用原项目，部分界面文案可能与当前版本不同。

## 功能与改进

本项目保留原版的视频状态监控、提示音、弹窗提醒、多标签页监控和手动暂停标记，并在当前版本提供以下功能：

- 视频自然播放结束后，随机等待 **3～7 秒**再尝试选择下一视频。
- 按目录顺序切换同一小节中的视频；本节结束后，逐层展开下一小节或下一章，支持 `6.2.2 → 6.2.3`、`6.2 → 6.3` 和跨大章切换。
- 遇到未完成测验、锁定项目、题目弹窗、目录加载失败或无法确认新视频时停止，并保留原有提醒。
- 网站已标记完成的非视频资源不会阻止继续；确认新视频已加载后，不发结束提醒。
- 新视频会自动执行原有防暂停逻辑、静音标签页并设为 2 倍速。

本改进版不代答或提交题目，不修改课程完成进度，也不调用网站接口强制解锁。需要做题或处理限制时，请回到课程页面手动完成。

## 安装与更新

适用于 Microsoft Edge、Google Chrome 等支持 Manifest V3 的 Chromium 浏览器。

1. 下载[本仓库 ZIP](https://github.com/zachary-a/uooc-video-watcher-extension/archive/refs/heads/master.zip)，解压到固定目录。
2. 打开浏览器扩展管理页面：Edge 为 `edge://extensions`，Chrome 为 `chrome://extensions`。
3. 开启“开发者模式”，点击“加载解压缩的扩展”，选择包含 `manifest.json` 的目录。
4. 打开 [UOOC](https://www.uooc.net.cn/league/union) 课程页面，手动选择并播放第一个视频。

<img width="601" height="675" alt="原项目的 Edge 扩展管理页面示例" src="https://github.com/user-attachments/assets/b6df3e9c-854c-40d5-a68b-9e9e4ca7b7e1" />

更新代码或切换版本后，请在扩展管理页面重新加载扩展，并刷新已经打开的 UOOC 课程页面。

## 使用方法

点击浏览器工具栏中的扩展图标打开控制面板。

| 控件 | 用途 |
| --- | --- |
| 全局监控 / 页面“启用” | 控制全局或指定页面的监控提醒。 |
| 手动执行防暂停 | 对当前课程页面再次执行原有防暂停逻辑。新视频也会自动执行。 |
| 测试提示音 | 检查扩展的提示音是否正常。 |
| 我确实要暂停 / 恢复提醒 | 手动暂停时暂时关闭该页面的暂停提醒，随后可恢复。 |

播放结束后，扩展会等待并检查目录。只有页面中的目标项目可用，且没有题目或弹窗阻挡时，才会继续切换。切换成功后继续监控新视频；遇到阻塞或课程已无后续视频时，弹窗提醒用户处理。普通暂停超过 10 秒或疑似被题目卡住时，也会按原有逻辑提醒。

<img width="553" height="426" alt="原项目的扩展控制面板示例" src="https://github.com/user-attachments/assets/bc50be30-9bba-4bfd-97a7-89fe61b87b11" />

<img width="425" height="325" alt="原项目的视频提醒弹窗示例" src="https://github.com/user-attachments/assets/f8b0e0c1-96a0-4179-b682-d019d18ea85f" />

## 版本与回退

上游项目及本地改进提交历史均保留在 Git 中。以下标签对应本地改进过程，并非上游项目的发布版本：

| 标签 | 内容 |
| --- | --- |
| `v0.5.0` | 本地修改前的基线版本。 |
| `v0.6.0` | 自动选择下一视频，成功时取消结束提醒。 |
| `v0.6.1` | 增加 3～7 秒随机等待。 |
| `v0.7.0` | 支持跨小节、跨章节及跨大章切换。 |

使用 Git 克隆本改进版：

```shell
git clone https://github.com/zachary-a/uooc-video-watcher-extension.git
cd uooc-video-watcher-extension
```

例如，临时回到上一版：

```shell
git switch --detach v0.6.1
```

返回当前维护分支：

```shell
git switch master
```

切换前请先提交或保存自己的改动。切换后重新加载扩展并刷新课程页面。

## 验证

使用 Node.js 内置测试运行器：

```shell
node --test auto-next.test.cjs cross-chapter.test.cjs
```

当前 22 项测试覆盖同节切换、跨小节、跨章、异步目录加载、未完成测验、锁定项目、弹窗阻挡和失败提醒。跨章功能目前通过目录页面样例验证，尚未完成登录后的真实课程实测；页面结构变化时，扩展会停止切换并保留提醒。

## 反馈与贡献

- 本改进版的问题或建议，请提交到[本仓库 Issues](https://github.com/zachary-a/uooc-video-watcher-extension/issues)。建议附上扩展版本、章节层级、页面状态及复现步骤。
- 原项目的讨论与基础功能说明，请参阅[原项目](https://github.com/liguanlin1212/uooc-video-watcher-extension)。
- 欢迎通过 Pull Request 提交改进，也感谢为原项目和本改进版提供反馈。
