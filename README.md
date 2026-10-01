# UOOC Video Watcher

## 简介

这是一个针对于提高在uooc平台上看视频效率的浏览器拓展工具（提高效率，懂得都懂）

这个平台：`https://www.uooc.net.cn/league/union`(别的平台我不保证能用喔)

在以下场景这个工具会对你有极大的帮助：
- 看mooc视频的时候，鼠标不能移出窗口，一旦移出窗口视频就暂停（哭）；
- 或许你是一个能一心多用，勤奋好学的好孩子，喜欢开好多个页面同时看mooc视频，但是由于上一条限制了你的好学；
- 有些页面的视频播放完后需要切换到下一个视频；
- 看mooc视频的时候，可能有做题弹窗弹出来而你“恰好”没有留意到，导致视频暂停，效率大大降低（哭）；

如果你的情况符合以上情况，恭喜你，你获得了我的【馈赠】！

但是！！！
以下情况是在本工具中不存在的且不被允许的：
- 本工具不涉及ai帮做题，所有的题目需要你独立完成；
- 本工具不涉及对官方网站的入侵！！！；

## 下载及安装方式（此处以edge举例）
1. 将仓库内所有文件下载到本地文件夹（最简单的方法下载zip总是会的吧）：

<img width="1098" height="525" alt="image" src="https://github.com/user-attachments/assets/ae64530c-1f9a-489b-89ef-1a8a05d87605" />

2. 打开edge-“拓展”-“管理拓展”-“开发人员选项”-“加载解压缩的拓展”，选择你下载到的文件夹，然后在下方就可以看到拓展“UOOC Video Watcher”：

<img width="601" height="675" alt="image" src="https://github.com/user-attachments/assets/b6df3e9c-854c-40d5-a68b-9e9e4ca7b7e1" />

<img width="1323" height="938" alt="image" src="https://github.com/user-attachments/assets/cdcc84da-650d-44dc-bf28-fe43553943f0" />

3. 请检查你的页面是否如下图所示：

<img width="824" height="847" alt="image" src="https://github.com/user-attachments/assets/fe9b894f-0dd1-4f59-89d5-3796dc758629" />

4. 此时，打开新的uooc页面，就可以愉快的使用本工具了！（使用方法在下边）

更新或重新加载扩展后，请刷新已经打开的 UOOC 课程页面，让新版本脚本进入页面。

## 自动切换下一视频

视频自然播放结束后，扩展会每次随机等待 3～7 秒，再按目录顺序选择下一视频。本小节播放完后，会进入下一小节；当前层级没有后续小节时，会向上查找下一章节，逐层展开并选择其中的第一个视频，支持如 6.2.2 → 6.2.3、6.2 → 6.3 和跨大章的切换。

遇到未完成的测验、锁定项目、题目弹窗、目录加载失败或无法确认新视频时，会停止自动切换，仍会响铃并弹窗请你手动处理；网站已经标记完成的非视频资源不会阻止继续。成功切换到新视频则不发结束提醒。本功能不提交题目、不修改课程进度，也不调用网站接口强制解锁。

使用 Git 回退：原始版本保存为 `v0.5.0`（`6e85cb3`），上一版保存为 `v0.6.1`（`576cf0a`）。如需回退到上一版，可运行 `git switch --detach v0.6.1`；回到最新版可运行 `git switch master`。切换后在浏览器扩展管理页面重新加载扩展，并刷新课程页面。

## 使用方法
1. 打开一个你爱看的mooc视频（如果是刚下载好工具的同学，重新打开uooc平台），左键打开拓展，右键点击“UOOC Video Watcher”：

  <img width="888" height="734" alt="image" src="https://github.com/user-attachments/assets/5e6a1e1f-89cc-4bb1-b0be-d885490ae4d4" />

2. 这时候就可以看到小工具的弹窗了，对按键做如下解释：
3. 
   - "手动防暂停"：扩展会在每次打开新视频时自动执行防暂停；如果网页的事件处理被重新绑定，也可以点此按钮再次执行。
   
   - “测试提示音”： 没什么卵用，你可以点击一下倾听悦耳的提示音（其实是懒得删了嘻嘻）（同时测试一下功能有没有问题）
   
   - “我确实要暂停”： 不排除有的同学确实要暂停视频去干别的事情啊，所以当你手动暂停后点击该按键，就可以不让工具提醒你（真贴心啊我）
   
   <img width="553" height="426" alt="image" src="https://github.com/user-attachments/assets/bc50be30-9bba-4bfd-97a7-89fe61b87b11" />
   
4. 展示有多个视频需要监控的时候，窗口的样子：

   <img width="375" height="600" alt="image" src="https://github.com/user-attachments/assets/83062797-b6cf-479f-9782-ce31e10d87b8" />
   
5. 当工具发出提醒的时候，会有这样一个弹窗出现，和一声悦耳动听的提示音（没错！就是前面那个！！！）：

   <img width="425" height="325" alt="image" src="https://github.com/user-attachments/assets/f8b0e0c1-96a0-4179-b682-d019d18ea85f" />

6. （现在应该傻子都会用了吧。。）另外分享一个小技巧，可以将这个工具固定在工具栏，方便使用：

   <img width="542" height="453" alt="image" src="https://github.com/user-attachments/assets/0fc44158-4fb1-4ab8-9a70-6b478214f031" />

   <img width="377" height="348" alt="image" src="https://github.com/user-attachments/assets/19041cfb-4085-46c9-b9a1-93bc68fdaa40" />

## 结语

如果这个工具对同学们有帮助的话，请大家点一点star（感恩感恩感恩）

<img width="1245" height="260" alt="image" src="https://github.com/user-attachments/assets/ce0be728-cf8c-47fb-acfa-2c5b40c44138" />

（我都放个照片标出来了大家就随手点个赞呗~）

如果有想提意见滴同学，请往这个邮箱里发，说明你的问题和附上相关照片，不然我是不了解你到底哪里出问题滴~

邮箱: 

`2025150200@mails.szu.edu.cn`

`3179313258@qq.com`

如果有大佬有改进的想法，可以直接fork给我，我应该会看的（应该吧。。。）

如果有小佬也有改进意见但不知道怎么fork的，参考这篇文章，fork给我：

`https://blog.csdn.net/w_D_lufei/article/details/103059857`

纯手打README，累死了（嘎巴一下死在电脑前）






