# 部署指南

这个项目对运行环境要求很低：**一台能跑 Node.js 22.5+ 的 Linux 机器 + 一个放行的端口**，
不需要数据库服务、不需要 `npm install`。

下面按「临时演示」和「正式云服务器」两条路说明。

---

## 方式一：临时公网演示（SSH 隧道，5 分钟）

适合：老师要一个能点开的链接、手边暂时没有云服务器。

原理：在你自己的电脑上跑服务，用 SSH 反向隧道把 `localhost:3000` 映射到公网域名。

```powershell
# 在项目根目录执行（Windows）
powershell -ExecutionPolicy Bypass -File tools/start-online.ps1
```

脚本会：

1. 检查 `http://127.0.0.1:3000` 是否在跑，没跑就先启动 `node server.js`；
2. 建立到 `localhost.run` 的 SSH 隧道（备用：`-Provider serveo`）；
3. 从日志里解析出公网地址并打印，例如 `https://xxxx.app.lhr.life`。

也可以手动执行：

```bash
ssh -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run
# 或
ssh -o ServerAliveInterval=30 -R 80:localhost:3000 serveo.net
```

**必须知道的限制：**

| 限制 | 说明 |
| --- | --- |
| 电脑必须开机联网 | 隧道是从你的机器反向连出去的，关机 / 睡眠 = 链接失效 |
| 域名会变 | 免费隧道每次重连都会分配新域名，博客里的链接要同步更新 |
| 不是云服务器 | 作业要求里的「云部署」最好用方式二，隧道只适合临时演示 |
| 有访问限制 | `serveo.net` 免费版会先出现一个浏览器警告页，点「Continue」才能进入 |

---

## 方式二：Render 免费部署（推荐给没有服务器的同学）

Render 是支持 Node Web 服务的免费 PaaS：连着 GitHub 仓库，推送代码就自动部署，
自带 `https://xxx.onrender.com` 域名和 HTTPS，不需要买服务器。

> **为什么不用 Netlify？** Netlify 只托管静态站点，本项目需要常驻的 Node 进程和
> SQLite 数据库文件；Netlify Functions 没有持久磁盘，导入的数据会丢。
> 所以后端请用 Render（或任意支持 Node 的云），Netlify 只适合纯前端项目。

### 1. 把代码推到 GitHub

仓库里已经初始化好 Git（9 次提交），在项目根目录执行：

```bash
git remote add origin https://github.com/<你的用户名>/contact-hub.git
git branch -M main
git push -u origin main
```

仓库必须是 **Public**，Render 免费版才能直接读取。

### 2. 在 Render 创建 Blueprint

1. 打开 https://dashboard.render.com/ ，用 GitHub 账号登录；
2. 点右上角 **New +** → **Blueprint**；
3. 选择刚推上去的 `contact-hub` 仓库 → **Connect**；
4. Render 会自动读取仓库里的 `render.yaml`，确认服务名 `contact-hub`、Plan `Free`；
5. 点 **Apply**，等待 2–3 分钟构建完成。

部署成功后地址形如：`https://contact-hub-xxxx.onrender.com`，
打开 `/api/health` 能看到 `{"status":"ok"}` 就说明后端起来了。

> 不想用 Blueprint 也可以手动建：**New + → Web Service** → 选仓库 →
> Runtime 选 `Node` → Build Command 填 `echo "no build step"` →
> Start Command 填 `node server.js` → 环境变量加
> `NODE_VERSION=24.11.0`、`DATA_DIR=/tmp/contact-hub-data`。

### 3. 免费版要知道的三件事

| 限制 | 影响 | 处理 |
| --- | --- | --- |
| 15 分钟无访问会休眠 | 第一次打开要等 30–60 秒 | 演示前先访问一次「唤醒」 |
| 没有持久磁盘 | 实例重启后数据回到种子数据 | 演示用的数据当场导入即可；要持久就挂付费 Disk 或换云服务器 |
| 每月 750 小时免费额度 | 单实例够用 | 不要同时开多个服务 |

### 4. 验证

```bash
curl -I https://contact-hub-xxxx.onrender.com/
curl https://contact-hub-xxxx.onrender.com/api/health
```

把地址填进博客的「云服务器部署地址」，就满足「不能是 localhost」的要求。

---

## 方式三：云服务器（最稳，对应 +15 分）

以华为云 / 阿里云 / 腾讯云的 Ubuntu 22.04 为例（学生机最便宜的那档就够）。

### 1. 准备服务器

- 购买后重置为 Ubuntu 22.04，记下公网 IP 与 root 密码；
- 在**安全组**放行 `3000` 端口（用 Nginx 的话放行 `80`）；
- 本地验证：`ssh root@<公网IP>` 能登录。

### 2. 安装 Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 必须 >= 22.5
```

### 3. 上传代码

方式 A：先推到 GitHub，再在服务器上 `git clone`（推荐，之后更新方便）：

```bash
git clone https://github.com/<你的用户名>/contact-hub.git /opt/contact-hub
```

方式 B：直接 scp 上传（不用 GitHub 时）：

```powershell
scp -r contact-hub root@<公网IP>:/opt/
```

### 4. 用 systemd 守护

仓库里已经带了服务文件：[deploy/contact-hub.service](deploy/contact-hub.service)

```bash
sudo mkdir -p /var/lib/contact-hub
sudo useradd -r -s /usr/sbin/nologin contact-hub || true
sudo chown -R contact-hub:contact-hub /var/lib/contact-hub /opt/contact-hub
sudo cp /opt/contact-hub/deploy/contact-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now contact-hub
sudo systemctl status contact-hub --no-pager
curl http://127.0.0.1:3000/api/health
```

> 服务文件默认以 `contact-hub` 用户运行，数据写在 `/var/lib/contact-hub/contacts.db`。
> 如果你的代码放在别的目录，记得同步修改 `WorkingDirectory`。

### 5. 开放访问

最省事：安全组放行 `3000`，直接访问 `http://<公网IP>:3000`。

想用 80 端口 / 域名：仓库里有 Nginx 配置示例 [deploy/nginx.conf](deploy/nginx.conf)

```bash
sudo apt-get install -y nginx
sudo cp /opt/contact-hub/deploy/nginx.conf /etc/nginx/sites-available/contact-hub
sudo ln -sf /etc/nginx/sites-available/contact-hub /etc/nginx/sites-enabled/contact-hub
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> 国内服务器用 80 端口绑域名需要 ICP 备案；没有备案就直接用 `IP:3000`，不影响演示。

### 6. 验证与运维

```bash
# 从本机（不是服务器）验证
curl -I http://<公网IP>:3000/
curl http://<公网IP>:3000/api/health

# 只允许本机访问数据库文件的权限参考
sudo chmod 600 /var/lib/contact-hub/contacts.db

# 备份
sudo cp /var/lib/contact-hub/contacts.db ~/contacts-backup-$(date +%F).db

# 更新代码
cd /opt/contact-hub && git pull && sudo systemctl restart contact-hub
```

### 7. 用 Docker 部署（可选）

仓库里有 [deploy/Dockerfile](deploy/Dockerfile)：

```bash
docker build -f deploy/Dockerfile -t contact-hub .
docker run -d --name contact-hub -p 3000:3000 -v /srv/contact-hub-data:/data contact-hub
```

数据卷 `/data` 对应容器内的 `DATA_DIR`。

---

## 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 服务器 `curl localhost:3000` 通，外网打不开 | 安全组没放行端口 | 云控制台 → 安全组 → 入方向放行 3000 |
| 启动报 `node:sqlite` 不存在 | Node 版本 < 22.5 | 升级 Node，`node -v` 确认 |
| 页面能开但接口 500 | `DATA_DIR` 没有写权限 | `chown` 给运行用户，或换目录 |
| 提交后数据没了 | 容器没挂数据卷 | `-v` 挂 `/data` |
| 隧道链接打不开 | 电脑睡眠 / SSH 断开 / 域名已轮换 | 重新执行 `tools/start-online.ps1`，更新博客链接 |
| 博客里写 localhost | 作业明确不算云部署 | 填公网 IP 或隧道域名 |
