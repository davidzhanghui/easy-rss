#!/usr/bin/env bash
#
# deploy.sh — 把 rss-proxy 部署到一台新 VPS
#
# 用法:
#   ./deploy.sh <ssh目标>            # 例如: ./deploy.sh root@203.0.113.10 或 ./deploy.sh my-vps
#
# 可选环境变量:
#   RSS_PROXY_PORT   远程监听端口, 默认 8765 (只绑 127.0.0.1, 不对外)
#   RSS_PROXY_TOKEN  复用已有 token; 不传则自动生成新 token
#   RSS_PROXY_ALLOW_ORIGIN  CORS 允许的来源, 默认 '*'; 生产建议设为你的前端域名
#   SSH_OPTS         追加给 ssh/scp 的参数, 例如 "-p 2222"
#
# 前置条件:
#   - 目标机可用 ssh 直连 (root, 或具备 sudo 的用户)
#   - 本机已能 ssh 到目标 (先配好 ~/.ssh/config 别名更省事)
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${RSS_PROXY_PORT:-8765}"
SSH_OPTS="${SSH_OPTS:-}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
gray()  { printf '\033[90m%s\033[0m\n' "$*"; }

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

TARGET="${1:-}"
[ -n "$TARGET" ] || usage 1
[ -f "$DIR/server.mjs" ] || { red "缺少 $DIR/server.mjs"; exit 1; }
[ -f "$DIR/ssrf.mjs" ] || { red "缺少 $DIR/ssrf.mjs"; exit 1; }
[ -f "$DIR/rss-proxy.service" ] || { red "缺少 $DIR/rss-proxy.service"; exit 1; }

# shellcheck disable=SC2086
SSH="ssh $SSH_OPTS -o ConnectTimeout=10"
# shellcheck disable=SC2086
SCP="scp $SSH_OPTS -o ConnectTimeout=10"

# ---- 0. 连通性 + 权限探测 ------------------------------------------------
gray ">> 检查 ssh 连通性: $TARGET"
$SSH "$TARGET" 'echo ok' >/dev/null 2>&1 || { red "无法 ssh 到 $TARGET"; exit 1; }

REMOTE_UID="$($SSH "$TARGET" 'id -u')"
if [ "$REMOTE_UID" = "0" ]; then
  SUDO=""
else
  $SSH "$TARGET" 'sudo -n true' 2>/dev/null || { red "非 root 且无免密 sudo，请用 root 登录"; exit 1; }
  SUDO="sudo"
fi
green "   ssh 正常 (uid=$REMOTE_UID, sudo='${SUDO:-none}')"

# ---- 1. 生成/确认 token ------------------------------------------------
if [ -z "${RSS_PROXY_TOKEN:-}" ]; then
  TOKEN="$(openssl rand -hex 24)"
  gray "   已生成新 token (仅本次输出显示)"
else
  TOKEN="$RSS_PROXY_TOKEN"
  gray "   复用 RSS_PROXY_TOKEN 环境变量"
fi

# ---- 2. 上传文件到 /tmp -------------------------------------------------
STAGE="/tmp/rss-proxy-deploy.$$"
gray ">> 上传 server.mjs / ssrf.mjs / unit / env 到 $TARGET:$STAGE"
$SSH "$TARGET" "mkdir -p '$STAGE'"
TMPENV="$(mktemp)"
printf 'RSS_PROXY_TOKEN=%s\nRSS_PROXY_PORT=%s\nRSS_PROXY_ALLOW_ORIGIN=%s\n' "$TOKEN" "$PORT" "${RSS_PROXY_ALLOW_ORIGIN:-*}" > "$TMPENV"
$SCP "$DIR/server.mjs" "$DIR/ssrf.mjs" "$DIR/rss-proxy.service" "$TMPENV" "$TARGET:$STAGE/"
$SSH "$TARGET" "mv '$STAGE/$(basename "$TMPENV")' '$STAGE/rss-proxy.env'"
rm -f "$TMPENV"

# ---- 3. 远端安装 --------------------------------------------------------
gray ">> 远端安装 (node>=18 / rssproxy 用户 / systemd)"
$SSH "$TARGET" "STAGE='$STAGE' PORT='$PORT' SUDO='$SUDO' bash -s" <<'REMOTE'
set -euo pipefail

$SUDO bash -c '
set -euo pipefail
STAGE="'"$STAGE"'"; PORT="'"$PORT"'"

# --- 系统族判断 ---
. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
  *rhel*|*fedora*|almalinux*|rocky*|centos*) FAMILY=rhel ;;
  *debian*|*ubuntu*)                         FAMILY=debian ;;
  *) echo "不支持的系统: $ID" >&2; exit 2 ;;
esac
echo "   OS: $PRETTY_NAME (family=$FAMILY)"

# --- Node >=18 ---
node_major() { command -v node >/dev/null 2>&1 && node -p "process.versions.node.split(\".\")[0]" 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 18 ]; then
  echo "   安装 Node.js 20 ..."
  if [ "$FAMILY" = rhel ]; then
    dnf install -y curl tar >/dev/null
    dnf module reset -y nodejs >/dev/null 2>&1 || true
    dnf module enable -y nodejs:20 >/dev/null 2>&1 || true
    dnf install -y nodejs >/dev/null
  else
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates >/dev/null
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
fi
[ "$(node_major)" -ge 18 ] || { echo "Node.js >=18 安装失败 (当前: $(node -v 2>/dev/null || echo none))" >&2; exit 1; }
NODE_BIN="$(command -v node)"
echo "   node: $($NODE_BIN -v) @ $NODE_BIN"

# --- rssproxy 用户 ---
NOLOGIN=/sbin/nologin; [ -x "$NOLOGIN" ] || NOLOGIN=/usr/sbin/nologin
id rssproxy >/dev/null 2>&1 || useradd -r -s "$NOLOGIN" -d /opt/rss-proxy rssproxy
echo "   user: rssproxy ok"

# --- 安装文件 ---
mkdir -p /opt/rss-proxy
install -o rssproxy -g rssproxy -m 644 "$STAGE/server.mjs" /opt/rss-proxy/server.mjs
install -o rssproxy -g rssproxy -m 644 "$STAGE/ssrf.mjs" /opt/rss-proxy/ssrf.mjs
install -o rssproxy -g rssproxy -m 600 "$STAGE/rss-proxy.env" /etc/rss-proxy.env
install -m 644 "$STAGE/rss-proxy.service" /etc/systemd/system/rss-proxy.service
# node 不一定在 /usr/bin，按实际路径修正 ExecStart
sed -i "s|ExecStart=.*|ExecStart=$NODE_BIN /opt/rss-proxy/server.mjs|" /etc/systemd/system/rss-proxy.service

# --- 启动 ---
systemctl daemon-reload
systemctl enable --now rss-proxy
systemctl restart rss-proxy
sleep 1
systemctl is-active --quiet rss-proxy || { journalctl -u rss-proxy -n 20 --no-pager >&2; exit 1; }
echo "   systemd: rss-proxy active + enabled"

# --- 健康检查 ---
for i in 1 2 3 4 5; do
  [ "$(curl -s -m 5 "http://127.0.0.1:$PORT/healthz" 2>/dev/null)" = "ok" ] && break
  sleep 1
done
[ "$(curl -s -m 5 "http://127.0.0.1:$PORT/healthz" 2>/dev/null)" = "ok" ] \
  || { echo "healthz 检查失败" >&2; journalctl -u rss-proxy -n 20 --no-pager >&2; exit 1; }
echo "   healthz: ok (127.0.0.1:$PORT, 仅回环)"

rm -rf "$STAGE"
'
REMOTE

# ---- 4. 收尾输出 --------------------------------------------------------
echo
green "== 部署完成 =="
echo "远程代理: 127.0.0.1:$PORT @ $TARGET (仅回环, 防火墙无需放行)"
echo
echo "本机接入 (SSH 隧道, 假设 ssh 别名为 $TARGET):"
echo "  ssh -f -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \\"
echo "    -o ExitOnForwardFailure=yes -L 18766:127.0.0.1:$PORT $TARGET"
echo
echo "阅读器 .env 配置:"
echo "  VITE_RSS_PROXY=custom"
echo "  VITE_RSS_PROXY_URL=http://127.0.0.1:18766/?token=$TOKEN&url={url}"
echo
gray "提示: 隧道端口 18766 若已被其他隧道占用, 换个本地端口即可; 改完 .env 需 ./rss.sh restart"
