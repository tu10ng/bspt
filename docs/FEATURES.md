# BSPT Feature Documentation

> BSP 开发者终端 - 完整特性清单与规划

## 目录

1. [应用场景分析](#1-应用场景分析)
2. [当前已实现特性](#2-当前已实现特性)
3. [问题分析与差距](#3-问题分析与差距)
4. [性能指标与基准](#4-性能指标与基准)
5. [未来特性规划](#5-未来特性规划)
6. [实施优先级](#6-实施优先级)

---

## 1. 应用场景分析

### 1.1 目标用户

**BSP (Board Support Package) 开发者**，日常工作包括：
- 连接华为 VRP 路由器进行配置和调试
- 通过路由器管理口访问内部 Linux 单板
- 调试嵌入式 Linux 系统（内核、驱动、用户态程序）
- 分析日志输出，定位代码问题

### 1.2 使用环境

| 特征 | 描述 |
|------|------|
| 网络环境 | 内网/专网，非公网暴露 |
| 认证方式 | 简单密码认证为主（Telnet/SSH 密码） |
| 设备类型 | 华为 VRP 路由器 + Linux 开发板 |
| 连接数量 | 同时 5-20 个设备 |
| 会话时长 | 长时间保持（数小时到数天） |
| 数据敏感性 | 中低（开发/测试数据） |

### 1.3 核心需求优先级

```
高优先级 (必须有)
├── 稳定的多设备连接
├── 快速切换和对比多个终端
├── 长时间连接保持（自动重连）
├── 日志追踪到源码
├── 命令历史和自动补全
└── 高吞吐量输出处理

中优先级 (应该有)
├── 会话日志持久化
├── 批量命令执行
├── 串口连接（板端调试）
├── 文件传输（上传固件/下载日志）
└── 布局保存/恢复

低优先级 (可以有)
├── 主题自定义
├── 配置文件
└── 脚本自动化
```

### 1.4 与竞品差异化

| 功能 | SecureCRT | WezTerm | BSPT 定位 |
|------|-----------|---------|-----------|
| 核心场景 | 企业运维 | 通用开发 | **BSP 开发** |
| VRP 支持 | ❌ 无 | ❌ 无 | ✅ **原生支持** |
| Log Tracer | ❌ 无 | ❌ 无 | ✅ **独有功能** |
| Board 层级 | ❌ 无 | ❌ 无 | ✅ **Router→Board 树** |
| 安全认证 | ✅ 全面 | N/A | ⚪ 简单密码即可 |
| 价格 | $99+ 商业 | 免费 | 免费开源 |

---

## 2. 当前已实现特性

### 2.1 终端核心 (Terminal Core)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| xterm.js WebGL 渲染 | ✅ | `UnifiedTerminal.tsx:296-304` | GPU 加速渲染，失败时自动降级 |
| 透明背景 | ✅ | `UnifiedTerminal.tsx:240` | `background: '#00000000'` |
| Dracula 配色 | ✅ | `UnifiedTerminal.tsx:241-261` | 完整 16 色 + 亮色支持 |
| 10000 行滚动缓冲 | ✅ | `UnifiedTerminal.tsx:266` | 固定值，后续可配置 |
| 终端尺寸自适应 | ✅ | `FitAddon` + `ResizeObserver` | 容器变化自动 fit |
| 搜索功能 | ✅ | `SearchAddon` + `Ctrl+F` | 支持高亮、上/下一个 |
| 光标闪烁 | ✅ | `cursorBlink: true` | Block 样式 |

### 2.2 连接协议 (Connection Protocols)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| SSH2 密码认证 | ✅ | `ssh.rs:40-80` | russh 库实现 |
| Telnet 协议 | ✅ | `telnet.rs` | IAC 协商、VT100 支持 |
| NAWS 窗口大小 | ✅ | `telnet.rs` | 终端 resize 同步到服务器 |
| Terminal Type 协商 | ✅ | `telnet.rs` | xterm-256color |
| SSH Keepalive | ✅ | `ssh.rs:20-22` | 30s 间隔，3 次重试 |
| 协议切换 | ✅ | `sessionTreeStore.ts` | SSH ↔ Telnet 运行时切换 |

### 2.3 会话管理 (Session Management)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| 树形会话视图 | ✅ | `SessionTree.tsx` | react-arborist 实现 |
| Router → Board 层级 | ✅ | `sessionTreeStore.ts` | 管理口 + 单板 IP 结构 |
| 连接状态指示 | ✅ | CSS `.state-*` 类 | 绿/黄/红点 + 动画 |
| 协议徽章 | ✅ | `[S]` / `[T]` | SSH/Telnet 标识 |
| 右键上下文菜单 | ✅ | `TreeContextMenu.tsx` | 连接/断开/扫描/删除 |
| 双击连接 | ✅ | `SessionTree.tsx` | 快速连接节点 |
| 会话持久化 | ✅ | localStorage `bspt-session-tree` | 配置信息持久化 |

### 2.4 华为 VRP 支持 (Huawei VRP) - **核心差异化**

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| 自动分页处理 | ✅ | `vrp.rs` | 检测 `---- More ----` 自动发送空格 |
| 视图检测 | ✅ | `vrp.rs` | User `<>` / System `[]` / Interface `[-]` |
| Board 扫描 | ✅ | `display device` 解析 | 自动填充子节点 |
| VRP 事件发射 | ✅ | Tauri `session:{id}:vrp` | 前端监听视图/分页变化 |
| TAB 补全处理 | ✅ | VT100 `\x08` 回删序列 | 正确显示补全结果 |

### 2.5 Block 终端模式 (Block-Based Terminal)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| 命令块标记 | ✅ | `blockStore.ts` | 每条命令一个 BlockMarker |
| 折叠/展开 | ✅ | Overlay 遮罩方式 | 点击 gutter 图标切换 |
| 状态着色 | ✅ | running/success/error | 绿/黄/红 gutter 标记 |
| 批量折叠 | ✅ | `Ctrl+Shift+[` / `]` | 全部折叠/展开 |
| 滚动同步 | ✅ | `useGutterSync.ts` | Gutter 与终端同步滚动 |
| 大纲视图 | ✅ | `Outline.tsx` | 右侧面板命令列表 |

### 2.6 智能补全 (Smart Completion)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| Fish 风格 Ghost Text | ✅ | `InlineGhostText.tsx` | 行内灰色建议文字 |
| 历史记录匹配 | ✅ | `blockStore.ts:getCommandHistory` | 基于已执行命令 |
| 三种排序算法 | ✅ | recent/frequency/combined | 可配置优先策略 |
| 去重处理 | ✅ | 保留最近一次出现 | 避免重复建议 |
| Tab 接受建议 | ✅ | `UnifiedTerminal.tsx:355-360` | 按 Tab 自动填充 |

### 2.7 背压控制 (Backpressure)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| RingBuffer | ✅ | `ringbuffer.rs` | 256KB 容量 |
| 水位标记 | ✅ | 80% 高水位 / 20% 低水位 | 暂停/恢复读取 |
| 前端批量处理 | ✅ | `UnifiedTerminal.tsx:389-433` | 每 10 次写入通知一次 |
| drain 信号 | ✅ | `notify_buffer_drained` 命令 | 前端 → 后端反馈 |

### 2.8 Log Tracer (日志追踪) - **核心差异化**

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| C 源码索引 | ✅ | `tracer.rs` tree-sitter | 解析 printf/log 格式串 |
| AhoCorasick 匹配 | ✅ | 多模式高效匹配 | O(n) 时间复杂度 |
| React Flow 可视化 | ✅ | `FlowPanel.tsx` | 调用链节点图 |
| VS Code 深链接 | ✅ | `vscode.ts` | 点击跳转到源码位置 |
| 远程 SSH 链接 | ✅ | `openInVSCodeRemote()` | 支持 Remote-SSH 扩展 |

### 2.9 主题系统 (Theme System)

| 特性 | 状态 | 实现位置 | 说明 |
|------|------|----------|------|
| 三种模式 | ✅ | glass/solid/image | 毛玻璃/纯色/背景图 |
| 透明度调节 | ✅ | 0-100% 滑块 | 实时预览 |
| 模糊强度 | ✅ | 0-50px 滑块 | backdrop-filter |
| 字体选择 | ✅ | 下拉菜单 | JetBrains Mono 默认 |
| Windows Acrylic | ✅ | `window-vibrancy` crate | 原生毛玻璃效果 |

---

## 3. 问题分析与差距

### 3.1 连接稳定性问题 [严重]

#### 问题 3.1.1: 无自动重连机制

**现状**: 连接断开后状态变为 `Error`，需要手动重新连接。

**影响**:
- 开发板重启后需要手动重连所有终端
- 网络抖动导致正在执行的操作中断
- 长时间调试时需要频繁手动操作

**BSP 场景**: 开发板经常重启（刷固件、内核调试），自动重连是刚需。

**解决方案**:
```rust
// src-tauri/src/reconnect.rs
pub struct ReconnectPolicy {
    enabled: bool,
    max_retries: u32,           // 默认 10（开发板重启可能较慢）
    initial_delay_ms: u64,      // 默认 2000
    max_delay_ms: u64,          // 默认 60000
    backoff_multiplier: f64,    // 默认 1.5
}

impl SessionManager {
    async fn reconnect_with_backoff(&self, session_id: &str) -> Result<(), Error> {
        let policy = self.get_reconnect_policy(session_id);
        let mut delay = policy.initial_delay_ms;

        self.emit_state(session_id, "reconnecting");

        for attempt in 0..policy.max_retries {
            tracing::info!(attempt, delay, "Attempting reconnect...");

            match self.connect(session_id).await {
                Ok(_) => {
                    self.emit_state(session_id, "connected");
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!(attempt, "Reconnect failed: {}", e);
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                    delay = ((delay as f64) * policy.backoff_multiplier) as u64;
                    delay = delay.min(policy.max_delay_ms);
                }
            }
        }

        self.emit_state(session_id, "error");
        Err(Error::ReconnectExhausted)
    }
}
```

**前端状态显示**:
```typescript
// 新增 reconnecting 状态
type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"  // 新增
  | "error";
```

#### 问题 3.1.2: 无连接心跳检测

**现状**: SSH 有 keepalive，但 Telnet 无任何心跳机制，连接静默死亡后用户无感知。

**影响**:
- 用户输入命令后才发现连接已断开
- 浪费时间等待超时

**解决方案**:
```rust
// Telnet 添加 TCP keepalive
let socket = TcpStream::connect(&addr).await?;
let sock_ref = socket2::SockRef::from(&socket);
sock_ref.set_tcp_keepalive(&TcpKeepalive::new()
    .with_time(Duration::from_secs(30))
    .with_interval(Duration::from_secs(10))
)?;
```

---

### 3.2 多终端视图问题 [严重]

#### 问题 3.2.1: 单终端视图

**现状**: 只能查看一个活跃会话，切换时前一个终端不可见。

**影响**:
- 无法同时对比路由器和单板输出
- 无法同时监控多个单板
- 调试效率低（需要频繁切换）

**BSP 场景**: 常见工作流：
1. 路由器上执行命令
2. 查看单板反应
3. 对比多个单板状态

**解决方案**: 标签页 + 分屏

```
┌─────────────────────────────────────────────────────────┐
│ [Router1] [Board1] [Board2] [+]                         │ ← 标签页
├───────────────────────────┬─────────────────────────────┤
│ Router1 Terminal          │ Board1 Terminal             │ ← 分屏
│ <Huawei> display device   │ root@board1:~# dmesg -w     │
│ Slot 1: Board1            │ [12345.678] driver loaded   │
│ Slot 2: Board2            │ [12345.789] init complete   │
├───────────────────────────┼─────────────────────────────┤
│ Board2 Terminal           │                             │
│ root@board2:~# top        │                             │
│ PID  CPU  MEM  COMMAND    │                             │
└───────────────────────────┴─────────────────────────────┘
```

#### 问题 3.2.2: 无广播输入

**现状**: 无法同时向多个会话发送相同命令。

**BSP 场景**: 批量操作多个单板（如同时重启、同时查看状态）。

**解决方案**:
```typescript
// src/stores/broadcastStore.ts
interface BroadcastState {
  enabled: boolean;
  targetSessions: string[];  // 选中的会话 ID

  toggle: () => void;
  setTargets: (ids: string[]) => void;
  broadcast: (input: string) => void;
}
```

---

### 3.3 会话日志问题 [中等]

#### 问题 3.3.1: 无会话日志文件

**现状**: 终端输出只存在于 xterm.js 缓冲区，关闭即丢失。

**影响**:
- 调试过程无法回溯
- 无法分析之前的 panic/crash 日志
- 无法分享日志给同事

**BSP 场景**: 内核 panic、驱动 crash 等问题需要完整日志分析。

**解决方案**:
```rust
// src-tauri/src/session_logger.rs
pub struct SessionLogger {
    file: BufWriter<File>,
    format: LogFormat,
    session_id: String,
}

pub enum LogFormat {
    Raw,              // 原始字节流（含 ANSI 转义）
    Plain,            // 纯文本（移除转义序列）
    Timestamped,      // [2024-01-15 10:30:45.123] <output>
}

impl SessionLogger {
    pub fn new(session_id: &str, log_dir: &Path) -> io::Result<Self> {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let filename = format!("{}_{}.log", session_id, timestamp);
        let path = log_dir.join(filename);

        let file = File::create(path)?;
        Ok(Self {
            file: BufWriter::new(file),
            format: LogFormat::Timestamped,
            session_id: session_id.to_string(),
        })
    }

    pub fn log(&mut self, data: &[u8]) -> io::Result<()> {
        match self.format {
            LogFormat::Timestamped => {
                let ts = chrono::Local::now().format("%H:%M:%S%.3f");
                write!(self.file, "[{}] ", ts)?;
                // 按行分割，每行加时间戳
                for line in data.split(|&b| b == b'\n') {
                    self.file.write_all(line)?;
                    self.file.write_all(b"\n")?;
                }
            }
            LogFormat::Raw => {
                self.file.write_all(data)?;
            }
            LogFormat::Plain => {
                let text = strip_ansi_escapes::strip(data);
                self.file.write_all(&text)?;
            }
        }
        self.file.flush()
    }
}
```

**日志目录结构**:
```
~/.bspt/logs/
├── 192.168.1.1_20240115_103045.log    # Router1
├── 192.168.1.10_20240115_103050.log   # Board1
└── 192.168.1.11_20240115_103055.log   # Board2
```

---

### 3.4 历史记录问题 [中等]

#### 问题 3.4.1: 无历史导出

**现状**: 命令历史只在 localStorage 中，无导出功能。

**影响**:
- 无法分享常用命令给同事
- 无法在文档中引用

**解决方案**:
```typescript
// src/utils/historyExport.ts
export function exportHistory(sessionId: string, format: 'json' | 'txt' | 'shell') {
  const markers = useBlockStore.getState().getSessionMarkers(sessionId);

  switch (format) {
    case 'json':
      return JSON.stringify(markers.map(m => ({
        command: m.command,
        timestamp: m.timestamp,
        status: m.status,
      })), null, 2);

    case 'txt':
      return markers.map(m => m.command).join('\n');

    case 'shell':
      // 生成可执行的 shell 脚本
      return markers.map(m => `# ${m.timestamp}\n${m.command}`).join('\n\n');
  }
}
```

#### 问题 3.4.2: 滚动缓冲不可配置

**现状**: 硬编码 10000 行。

**BSP 场景**: 内核启动日志、dmesg 输出可能超过 10000 行。

**解决方案**: 配置化，范围 1000 - 100000。

---

### 3.5 串口连接缺失 [中等]

#### 问题 3.5.1: 无串口支持

**现状**: 只支持 SSH/Telnet 网络连接。

**BSP 场景**:
- 开发板无网络时通过串口调试
- 查看 U-Boot、内核早期启动日志
- 板端 console 调试

**解决方案**:
```rust
// src-tauri/src/serial.rs
use tokio_serial::{SerialPortBuilderExt, SerialStream};

pub struct SerialConfig {
    pub port: String,        // /dev/ttyUSB0, COM1
    pub baud_rate: u32,      // 115200
    pub data_bits: DataBits, // 8
    pub stop_bits: StopBits, // 1
    pub parity: Parity,      // None
    pub flow_control: FlowControl, // None
}

pub async fn run_serial_session(
    session_id: String,
    config: SerialConfig,
    manager: Arc<SessionManager>,
) -> Result<(), Error> {
    let port = tokio_serial::new(&config.port, config.baud_rate)
        .data_bits(config.data_bits)
        .stop_bits(config.stop_bits)
        .parity(config.parity)
        .open_native_async()?;

    // ... 数据流处理
}
```

**前端协议扩展**:
```typescript
type Protocol = "ssh" | "telnet" | "serial";

interface SerialNode {
  id: string;
  type: "serial";
  port: string;      // /dev/ttyUSB0
  baudRate: number;  // 115200
  connectionState: ConnectionState;
  sessionId: string | null;
}
```

---

### 3.6 文件传输缺失 [中等]

#### 问题 3.6.1: 无文件上传/下载

**现状**: 需要另开终端使用 scp/sftp。

**BSP 场景**:
- 上传编译好的固件/内核到单板
- 下载单板上的日志文件
- 传输配置文件

**解决方案**: 集成简单的 SFTP 功能

```rust
// 使用 russh-sftp
use russh_sftp::client::SftpSession;

pub async fn upload_file(
    session_id: &str,
    local_path: &Path,
    remote_path: &str,
) -> Result<(), Error> {
    let sftp = self.get_sftp_session(session_id).await?;
    let mut remote_file = sftp.create(remote_path).await?;
    let mut local_file = tokio::fs::File::open(local_path).await?;
    tokio::io::copy(&mut local_file, &mut remote_file).await?;
    Ok(())
}
```

**前端 UI**: 拖拽上传 + 右键菜单下载

---

### 3.7 VRP 增强需求 [中等]

#### 问题 3.7.1: VRP 命令补全不足

**现状**: 只有历史记录补全，无 VRP 命令智能补全。

**BSP 场景**: VRP 命令众多，新手难以记忆。

**解决方案**:
```typescript
// src/data/vrpCommands.ts
export const VRP_COMMANDS = {
  userView: [
    "display device",
    "display interface brief",
    "display ip interface brief",
    "display version",
    "system-view",
  ],
  systemView: [
    "interface GigabitEthernet",
    "ip address",
    "quit",
    "return",
  ],
  // ...
};

// 根据当前 VRP 视图提供不同建议
function getVrpSuggestions(view: VrpView, input: string): string[] {
  const commands = VRP_COMMANDS[view] || [];
  return commands.filter(cmd => cmd.startsWith(input));
}
```

#### 问题 3.7.2: 无 Board IP 自动发现

**现状**: `display device` 解析可能不完整，需要手动添加 IP。

**解决方案**: 增强 VRP 解析器，支持更多命令输出格式。

---

### 3.8 其他问题

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 无会话恢复 | 中 | 应用重启后需要重新连接 |
| 无配置文件 | 低 | 所有配置存 localStorage |
| 无快捷键自定义 | 低 | 硬编码快捷键 |
| 无粘贴确认 | 低 | 大量粘贴无警告 |
| 无正则搜索 | 低 | 只支持子串搜索 |

---

## 4. 性能指标与基准

### 4.1 性能目标

| 指标 | 目标值 | 测量方法 | 说明 |
|------|--------|----------|------|
| 首次渲染时间 (FCP) | < 500ms | Lighthouse | 应用启动到可交互 |
| 输入延迟 | < 16ms | 按键到回显 | 60fps 体验 |
| 滚动帧率 | 60fps | DevTools | WebGL 渲染 |
| 大输出处理 | 100k 行无卡顿 | 压力测试 | 内核日志场景 |
| 内存占用 | < 300MB (10 会话) | 任务管理器 | 长时间运行 |
| 连接建立时间 | < 3s | 计时 | 包含认证 |
| 重连时间 | < 5s | 计时 | 自动重连 |

### 4.2 压力测试方案

```bash
# 测试 1: 大量输出（模拟内核启动日志）
seq 1 100000 | while read i; do echo "[$(date +%H:%M:%S.%N)] kernel: test log line $i"; done

# 测试 2: 快速输出（模拟 dmesg -w）
while true; do echo "[$(date +%s.%N)] test"; sleep 0.001; done

# 测试 3: 多会话同时输出
for i in {1..10}; do
  ssh board$i "while true; do date; sleep 0.1; done" &
done

# 测试 4: 长时间运行（24小时稳定性）
# 保持 5 个连接，每小时执行一次命令，检查内存增长
```

### 4.3 基准对比

| 终端 | 100k 行渲染 | 输入延迟 | 内存 (10 会话) |
|------|-------------|----------|----------------|
| SecureCRT | ~2s | ~10ms | ~150MB |
| WezTerm | ~1s | ~5ms | ~200MB |
| PuTTY | ~3s | ~15ms | ~50MB |
| **BSPT (目标)** | < 2s | < 16ms | < 300MB |

---

## 5. 未来特性规划

### Phase 6: 连接可靠性 (Connection Reliability) [P0]

**目标**: 长时间稳定连接，自动恢复

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 6.1 自动重连 (指数退避) | P0 | 中 | 2d |
| 6.2 重连状态 UI | P0 | 低 | 0.5d |
| 6.3 TCP Keepalive (Telnet) | P1 | 低 | 0.5d |
| 6.4 连接超时配置 | P2 | 低 | 0.5d |
| 6.5 会话状态快照 | P2 | 高 | 3d |

**验收标准**:
- [ ] 设备重启后 60s 内自动重连
- [ ] 重连过程显示进度（尝试次数/最大次数）
- [ ] 网络断开时立即检测并开始重连

---

### Phase 7: 多终端支持 (Multi-Terminal) [P0]

**目标**: 同时查看和操作多个终端

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 7.1 标签页系统 | P0 | 中 | 3d |
| 7.2 标签页拖拽排序 | P2 | 中 | 1d |
| 7.3 水平分屏 (Ctrl+Shift+D) | P0 | 高 | 3d |
| 7.4 垂直分屏 (Ctrl+D) | P1 | 中 | 1d |
| 7.5 分屏大小调整 | P1 | 中 | 1d |
| 7.6 焦点管理 (Alt+Arrow) | P1 | 低 | 1d |
| 7.7 布局保存/恢复 | P2 | 中 | 2d |
| 7.8 广播输入模式 | P1 | 中 | 2d |

**验收标准**:
- [ ] 支持 20+ 标签页无性能下降
- [ ] 支持 2x2 分屏布局
- [ ] Ctrl+Tab 切换标签
- [ ] 广播模式可同时向多个终端发送命令

**数据结构**:
```typescript
// src/stores/layoutStore.ts
interface PaneNode {
  id: string;
  type: 'terminal' | 'split';
  sessionId?: string;           // terminal 类型
  direction?: 'horizontal' | 'vertical';  // split 类型
  children?: PaneNode[];        // split 类型
  size?: number;                // 百分比
}

interface Tab {
  id: string;
  title: string;
  root: PaneNode;
}

interface LayoutState {
  tabs: Tab[];
  activeTabId: string;
  broadcastMode: boolean;
  broadcastTargets: string[];
}
```

---

### Phase 8: 会话日志 (Session Logging) [P1]

**目标**: 完整的会话记录能力

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 8.1 自动日志记录 | P0 | 中 | 2d |
| 8.2 日志格式选择 | P1 | 低 | 0.5d |
| 8.3 日志目录管理 | P1 | 低 | 0.5d |
| 8.4 日志轮转 (按大小/日期) | P2 | 低 | 1d |
| 8.5 日志查看器 | P2 | 中 | 2d |
| 8.6 日志搜索 | P2 | 中 | 2d |
| 8.7 日志导出 (单个/批量) | P1 | 低 | 0.5d |

**日志格式**:
```
Raw:        原始字节流（可用于回放）
Plain:      移除 ANSI 转义序列
Timestamped: [10:30:45.123] <output>（默认）
```

**验收标准**:
- [ ] 默认记录所有会话到 `~/.bspt/logs/`
- [ ] 日志文件名格式: `{host}_{date}_{time}.log`
- [ ] 可在设置中关闭自动日志

---

### Phase 9: 串口连接 (Serial Connection) [P1]

**目标**: 支持串口连接开发板

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 9.1 串口枚举 | P0 | 中 | 1d |
| 9.2 串口连接 | P0 | 中 | 2d |
| 9.3 波特率配置 | P0 | 低 | 0.5d |
| 9.4 串口节点 UI | P0 | 低 | 1d |
| 9.5 串口断线重连 | P1 | 中 | 1d |

**依赖**: `tokio-serial` crate

**验收标准**:
- [ ] 可列出系统串口设备
- [ ] 支持常见波特率 (9600, 115200, etc.)
- [ ] 串口拔插自动检测

---

### Phase 10: 文件传输 (File Transfer) [P2]

**目标**: 简单的文件上传下载

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 10.1 SFTP 会话复用 | P0 | 中 | 2d |
| 10.2 文件上传 (拖拽) | P0 | 中 | 2d |
| 10.3 文件下载 (右键) | P0 | 中 | 1d |
| 10.4 传输进度显示 | P1 | 中 | 1d |
| 10.5 批量传输 | P2 | 中 | 2d |

**验收标准**:
- [ ] 拖拽文件到终端区域即可上传
- [ ] 右键菜单支持下载远程文件
- [ ] 显示传输进度和速度

---

### Phase 11: VRP 增强 (VRP Enhancement) [P2]

**目标**: 更智能的 VRP 支持

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 11.1 VRP 命令补全词典 | P1 | 中 | 2d |
| 11.2 视图感知补全 | P1 | 中 | 1d |
| 11.3 增强 Board 解析 | P1 | 中 | 1d |
| 11.4 配置差异对比 | P2 | 高 | 3d |

**验收标准**:
- [ ] 在 User View 提示 `display` 系列命令
- [ ] 在 System View 提示 `interface` 等配置命令
- [ ] 准确解析 `display device` 输出

---

### Phase 12: 配置系统 (Configuration) [P3]

**目标**: 灵活的配置管理

| 任务 | 优先级 | 复杂度 | 预计工作量 |
|------|--------|--------|-----------|
| 12.1 TOML 配置文件 | P2 | 中 | 2d |
| 12.2 配置热重载 | P3 | 中 | 1d |
| 12.3 连接模板 | P2 | 低 | 1d |
| 12.4 快捷键自定义 | P3 | 中 | 2d |
| 12.5 配置导入/导出 | P2 | 低 | 1d |

**配置文件示例**:
```toml
# ~/.bspt/config.toml
[general]
theme = "dracula"
font_family = "JetBrains Mono"
font_size = 14
scrollback = 50000

[connection]
auto_reconnect = true
reconnect_max_retries = 10
reconnect_initial_delay_ms = 2000

[logging]
enabled = true
path = "~/.bspt/logs"
format = "timestamped"

[broadcast]
shortcut = "ctrl+shift+b"
```

---

## 6. 实施优先级

### 6.1 优先级矩阵

```
                    影响力 (开发效率提升)
                    高
                    │
     P1             │            P0
  ┌─────────────────┼─────────────────┐
  │ - 会话日志      │ - 自动重连      │
  │ - 串口连接      │ - 多标签页      │
  │ - 广播输入      │ - 分屏视图      │
  │                 │                 │
  └─────────────────┼─────────────────┘
                    │
  ┌─────────────────┼─────────────────┐
  │ - 配置文件      │ - 文件传输      │
  │ - 快捷键配置    │ - VRP 命令补全  │
  │ - 历史导出      │ - 日志轮转      │
  │                 │                 │
  └─────────────────┼─────────────────┘
     P3             │            P2
                    │
                    低 ─────────────────── 高
                              紧迫性 (用户痛点)
```

### 6.2 实施路线图

```
v0.2.0 - 稳定可用版 (4 周)
├── Week 1-2: Phase 6 (自动重连)
│   ├── 指数退避重连逻辑
│   ├── Telnet TCP keepalive
│   └── 重连状态 UI
└── Week 3-4: Phase 7.1-7.3 (基础多终端)
    ├── 标签页系统
    └── 水平分屏

v0.3.0 - 多终端完善版 (4 周)
├── Week 1-2: Phase 7.4-7.8 (多终端完善)
│   ├── 垂直分屏
│   ├── 焦点管理
│   └── 广播输入
└── Week 3-4: Phase 8 (会话日志)
    ├── 自动日志记录
    └── 日志管理

v0.4.0 - 串口支持版 (3 周)
├── Week 1-2: Phase 9 (串口)
│   ├── 串口枚举和连接
│   └── 串口 UI
└── Week 3: Phase 10.1-10.3 (基础文件传输)
    └── SFTP 上传下载

v0.5.0 - 功能完善版 (3 周)
├── Week 1: Phase 11 (VRP 增强)
├── Week 2: Phase 10.4-10.5 (文件传输完善)
└── Week 3: Phase 12 (配置系统)

v1.0.0 - 正式版 (2 周)
├── 性能优化
├── 压力测试
├── Bug 修复
└── 文档完善
```

### 6.3 MVP (v0.2.0) 必须功能

| 功能 | 状态 | 说明 |
|------|------|------|
| SSH/Telnet 连接 | ✅ 完成 | |
| 会话树管理 | ✅ 完成 | |
| VRP 自动分页 | ✅ 完成 | |
| Block 终端 | ✅ 完成 | |
| Log Tracer | ✅ 完成 | |
| **自动重连** | ⏳ 待实现 | Phase 6 |
| **多标签页** | ⏳ 待实现 | Phase 7.1 |
| **分屏** | ⏳ 待实现 | Phase 7.3 |

### 6.4 版本里程碑

| 版本 | 目标 | 关键特性 | 预计时间 |
|------|------|----------|----------|
| v0.2.0 | 日常可用 | 自动重连、标签页、分屏 | 4 周 |
| v0.3.0 | 多设备调试 | 广播输入、会话日志 | 4 周 |
| v0.4.0 | 硬件调试 | 串口连接、文件传输 | 3 周 |
| v0.5.0 | 功能完整 | VRP 增强、配置系统 | 3 周 |
| v1.0.0 | 生产就绪 | 性能优化、稳定性 | 2 周 |

---

## 附录

### A. 技术债务清单

| 项目 | 位置 | 描述 | 优先级 |
|------|------|------|--------|
| 硬编码滚动行数 | `UnifiedTerminal.tsx:266` | 应可配置 | P2 |
| 硬编码快捷键 | `UnifiedTerminal.tsx:185-221` | 应可配置 | P3 |
| 无错误边界 | 全局 | React Error Boundary 未实现 | P1 |
| 无单元测试 | 全局 | 测试覆盖率 0% | P1 |
| 死代码警告 | `ringbuffer.rs` | 未使用的方法 | P3 |
| TODO 注释 | `ssh.rs:100` | known_hosts 未实现（内网可忽略） | P3 |

### B. 依赖库版本

```toml
# Cargo.toml 新增
tokio-serial = "5.4"        # 串口
russh-sftp = "2.0"          # SFTP
chrono = "0.4"              # 时间戳
strip-ansi-escapes = "0.2"  # 日志纯文本
socket2 = "0.5"             # TCP keepalive
```

```json
// package.json 新增
{
  "dependencies": {
    "allotment": "^1.0.0"   // 分屏布局
  }
}
```

### C. 竞品功能对比 (BSP 场景视角)

| 功能 | BSPT | SecureCRT | PuTTY | 说明 |
|------|------|-----------|-------|------|
| VRP 原生支持 | ✅ | ❌ | ❌ | **核心优势** |
| Log Tracer | ✅ | ❌ | ❌ | **核心优势** |
| Board 层级 | ✅ | ❌ | ❌ | **核心优势** |
| 多标签 | ⏳ | ✅ | ❌ | Phase 7 |
| 分屏 | ⏳ | ✅ | ❌ | Phase 7 |
| 自动重连 | ⏳ | ✅ | ❌ | Phase 6 |
| 串口 | ⏳ | ✅ | ✅ | Phase 9 |
| 文件传输 | ⏳ | ✅ | ❌ | Phase 10 |
| 会话日志 | ⏳ | ✅ | ✅ | Phase 8 |
| GPU 渲染 | ✅ | ❌ | ❌ | 性能优势 |
| 开源免费 | ✅ | ❌ $99 | ✅ | |
