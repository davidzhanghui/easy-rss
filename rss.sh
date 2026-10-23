#!/usr/bin/env bash
#
# rss.sh — EasyRSS 本地运行一键管理
#   ./rss.sh start    启动代理隧道 + dev server
#   ./rss.sh stop     停止 dev server + 代理隧道
#   ./rss.sh restart  重启
#   ./rss.sh status   查看状态（端口/隧道/代理健康/日志尾）
#   ./rss.sh logs     实时看 dev 日志
#
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT/.run"
LOG="$RUN_DIR/dev.log"
VITE_PID_FILE="$RUN_DIR/vite.pid"
PORT=3100
TUNNEL_LPORT=18766
TUNNEL_TARGET="127.0.0.1:8765"
# 隧道目标主机：环境变量 RSS_TUNNEL_HOST 优先，其次读本机 .env（不入库）中的同名变量
# 例： RSS_TUNNEL_HOST=my-vps
TUNNEL_HOST="${RSS_TUNNEL_HOST:-$(grep -E '^RSS_TUNNEL_HOST=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2-)}"
TUNNEL_HOST="${TUNNEL_HOST:-your-vps}"
TUNNEL_PAT="${TUNNEL_LPORT}:${TUNNEL_TARGET} ${TUNNEL_HOST}"

mkdir -p "$RUN_DIR"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
gray() { printf '\033[90m%s\033[0m\n' "$*"; }

vite_pids() {
  # 本项目的 vite 进程（按 node_modules 路径精确匹配，避免误杀别的项目）
  pgrep -f "$ROOT/node_modules/.bin/vite" 2>/dev/null || true
}

# PID 存活检查：只有进程真实存在（signal 0 可达）才算运行
pid_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

tunnel_pid() {
  pgrep -f "$TUNNEL_PAT" 2>/dev/null | head -1 || true
}

port_listening() {
  lsof -i:$PORT -sTCP:LISTEN -t 2>/dev/null || true
}

http_code() {
  curl -s -m 5 -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/" 2>/dev/null || echo "000"
}

wait_port_free() {
  local i
  for i in $(seq 1 20); do
    [ -z "$(port_listening)" ] && return 0
    sleep 0.5
  done
  return 1
}

start_tunnel() {
  local pid
  pid="$(tunnel_pid)"
  if [ -n "$pid" ]; then
    gray "tunnel 已在运行 (pid $pid)"
    return 0
  fi
  # shellcheck disable=SC2093
  ssh -f -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes -o ConnectTimeout=10 \
    -L "${TUNNEL_LPORT}:${TUNNEL_TARGET}" "$TUNNEL_HOST"
  sleep 1
  pid="$(tunnel_pid)"
  if [ -n "$pid" ]; then
    green "tunnel 已启动 (pid $pid): localhost:${TUNNEL_LPORT} -> ${TUNNEL_HOST}:8765"
  else
    red "tunnel 启动失败，请检查 ssh $TUNNEL_HOST"
    return 1
  fi
}

start_vite() {
  local pids code
  pids="$(vite_pids)"
  if [ -n "$pids" ]; then
    gray "vite 已在运行 (pid $pids)"
    return 0
  fi
  # 3100 还有监听者（且不是本项目 vite）就等几秒，不行再报错
  if [ -n "$(port_listening)" ]; then
    gray "等待端口 $PORT 释放…"
    if ! wait_port_free; then
      red "端口 $PORT 被占用且不是本项目 vite，请先处理：lsof -i:$PORT"
      return 1
    fi
  fi
  cd "$ROOT" || return 1
  # shellcheck disable=SC2094
  nohup npm run dev >"$LOG" 2>&1 &
  echo $! >"$VITE_PID_FILE"
  sleep 4
  code="$(http_code)"
  if [ "$code" = "200" ]; then
    green "vite 已启动: http://localhost:${PORT}/ (HTTP $code)"
  else
    red "vite 启动异常 (HTTP $code)，看日志：./rss.sh logs"
    return 1
  fi
}

stop_vite() {
  local pids pid
  pids="$(vite_pids)"
  if [ -z "$pids" ] && [ -f "$VITE_PID_FILE" ]; then
    pid="$(cat "$VITE_PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then pids="$pid"; fi
  fi
  if [ -z "$pids" ]; then
    gray "vite 未运行"
  else
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    green "vite 已停止 ($pids)"
  fi
  rm -f "$VITE_PID_FILE"
}

stop_tunnel() {
  local pid
  pid="$(tunnel_pid)"
  if [ -z "$pid" ]; then
    gray "tunnel 未运行"
  else
    kill "$pid" 2>/dev/null || true
    green "tunnel 已停止 (pid $pid)"
  fi
}

cmd_start() {
  start_tunnel && start_vite
}

cmd_stop() {
  stop_vite
  stop_tunnel
}

cmd_restart() {
  stop_vite
  start_tunnel && start_vite
}

cmd_status() {
  echo "== vite =="
  local pids code file_pid
  pids="$(vite_pids)"
  file_pid="$(cat "$VITE_PID_FILE" 2>/dev/null || true)"
  if [ -n "$pids" ] || pid_alive "$file_pid"; then
    code="$(http_code)"
    if [ "$code" != "200" ]; then
      red "端口无响应 (HTTP $code)，看日志：./rss.sh logs"
    else
      green "运行中 (pid ${pids:-$file_pid}, HTTP $code)  http://localhost:${PORT}/"
    fi
  else
    red "未运行"
  fi
  echo "== tunnel (${TUNNEL_HOST} rss-proxy) =="
  local tpid health
  tpid="$(tunnel_pid)"
  if [ -n "$tpid" ]; then
    health="$(curl -s -m 8 "http://localhost:${TUNNEL_LPORT}/healthz" 2>/dev/null || echo FAIL)"
    if [ "$health" = "ok" ]; then
      green "运行中 (pid $tpid, 代理健康 ok)"
    else
      red "隧道在但代理不通 (pid $tpid)，检查服务器端 rss-proxy"
    fi
  else
    red "未运行"
  fi
  echo "== 日志尾（${LOG}） =="
  tail -5 "$LOG" 2>/dev/null || gray "(无日志)"
}

cmd_logs() {
  tail -f "$LOG" 2>/dev/null || red "无日志文件"
}

usage() {
  echo "用法: ./rss.sh {start|stop|restart|status|logs}"
}

case "${1:-status}" in
start) cmd_start ;;
stop) cmd_stop ;;
restart) cmd_restart ;;
status) cmd_status ;;
logs) cmd_logs ;;
*) usage ;;
esac
