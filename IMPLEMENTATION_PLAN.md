# BSPT Implementation Plan

Detailed implementation guide for BSPT (Board Support Package Terminal).

## Phase 1: Project Foundation (COMPLETE)

### Goals
- Initialize Tauri v2 project with React + TypeScript + Vite
- Implement 3x3 CSS Grid layout with glass effects
- Create theme system (glass/image/solid modes)

### Tasks

1. **Initialize Project**
   ```bash
   npm create tauri-app@latest bspt -- --template react-ts
   cd bspt
   npm install
   ```

2. **Install Phase 1 Dependencies**

   Frontend:
   ```bash
   npm install tailwindcss postcss autoprefixer
   npm install zustand
   npm install @radix-ui/react-slider @radix-ui/react-select
   npx tailwindcss init -p
   ```

   Backend (Cargo.toml):
   ```toml
   [dependencies]
   tauri = { version = "2", features = ["shell-open"] }
   window-vibrancy = "0.5"
   tokio = { version = "1", features = ["full"] }
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   ```

3. **Implement CSS Grid Layout**

   Create `src/App.css`:
   ```css
   .app-grid {
     display: grid;
     grid-template-columns: 250px 1fr 300px;
     grid-template-rows: 40px 1fr 32px;
     grid-template-areas:
       "header header header"
       "sidebar terminal panel"
       "footer footer footer";
     height: 100vh;
   }
   ```

4. **Configure Window Vibrancy**

   In `src-tauri/src/main.rs`:
   ```rust
   use window_vibrancy::{apply_acrylic, apply_blur};

   fn main() {
       tauri::Builder::default()
           .setup(|app| {
               let window = app.get_webview_window("main").unwrap();
               #[cfg(target_os = "windows")]
               apply_acrylic(&window, Some((0, 0, 0, 125)))?;
               #[cfg(target_os = "macos")]
               apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)?;
               Ok(())
           })
           .run(tauri::generate_context!())
           .expect("error while running tauri application");
   }
   ```

5. **Create Theme Store**

   Create `src/stores/themeStore.ts`:
   ```typescript
   import { create } from 'zustand';

   interface ThemeConfig {
     mode: 'glass' | 'image' | 'solid';
     acrylicOpacity: number;
     blurStrength: number;
     fontFamily: string;
   }

   interface ThemeStore {
     theme: ThemeConfig;
     setTheme: (config: Partial<ThemeConfig>) => void;
   }

   export const useThemeStore = create<ThemeStore>((set) => ({
     theme: {
       mode: 'glass',
       acrylicOpacity: 0.7,
       blurStrength: 20,
       fontFamily: 'JetBrains Mono, monospace',
     },
     setTheme: (config) => set((state) => ({
       theme: { ...state.theme, ...config }
     })),
   }));
   ```

### Verification
- [x] Glass effect visible on Windows/macOS
- [x] Grid layout renders correctly
- [x] Theme slider adjusts opacity in real-time

---

## Phase 2: Terminal Core (COMPLETE)

### Goals
- Set up xterm.js with WebGL addon
- Implement Rust async SSH/Telnet clients
- Connect frontend to backend via Tauri IPC

### Tasks

1. **Install Terminal Dependencies**

   Frontend:
   ```bash
   npm install xterm xterm-addon-fit xterm-addon-webgl xterm-addon-search
   ```

   Backend (add to Cargo.toml):
   ```toml
   russh = "0.44"
   russh-keys = "0.44"
   dashmap = "5"
   tracing = "0.1"
   tracing-subscriber = "0.3"
   ```

2. **Create Terminal Component**

   Create `src/components/Terminal/Terminal.tsx`:
   ```typescript
   import { useEffect, useRef } from 'react';
   import { Terminal } from 'xterm';
   import { FitAddon } from 'xterm-addon-fit';
   import { WebglAddon } from 'xterm-addon-webgl';
   import 'xterm/css/xterm.css';

   export function TerminalView({ sessionId }: { sessionId: string }) {
     const containerRef = useRef<HTMLDivElement>(null);
     const termRef = useRef<Terminal | null>(null);

     useEffect(() => {
       if (!containerRef.current) return;

       const term = new Terminal({
         allowTransparency: true,
         theme: { background: '#00000000' },
         fontFamily: 'JetBrains Mono, monospace',
         fontSize: 14,
       });

       const fitAddon = new FitAddon();
       term.loadAddon(fitAddon);
       term.open(containerRef.current);

       // Load WebGL after open
       const webglAddon = new WebglAddon();
       term.loadAddon(webglAddon);

       fitAddon.fit();
       termRef.current = term;

       return () => term.dispose();
     }, [sessionId]);

     return <div ref={containerRef} className="h-full w-full" />;
   }
   ```

3. **Implement Rust Session Manager**

   Create `src-tauri/src/session.rs`:
   ```rust
   use dashmap::DashMap;
   use russh::{client, ChannelId};
   use serde::{Deserialize, Serialize};
   use std::sync::Arc;
   use tokio::sync::mpsc;

   #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
   pub enum Protocol {
       Telnet,
       Ssh,
   }

   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct SessionConfig {
       pub id: String,
       pub host: String,
       pub port: u16,
       pub protocol: Protocol,
       pub username: String,
       pub password: String,
   }

   pub struct SessionManager {
       sessions: DashMap<String, Arc<Session>>,
   }

   impl SessionManager {
       pub fn new() -> Self {
           Self {
               sessions: DashMap::new(),
           }
       }

       pub async fn create_session(&self, config: SessionConfig) -> Result<String, String> {
           // Implementation here
           Ok(config.id)
       }

       pub async fn send_data(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
           // Implementation here
           Ok(())
       }
   }
   ```

4. **Create Tauri Commands**

   In `src-tauri/src/main.rs`:
   ```rust
   #[tauri::command]
   async fn create_session(
       config: SessionConfig,
       state: tauri::State<'_, SessionManager>,
   ) -> Result<String, String> {
       state.create_session(config).await
   }

   #[tauri::command]
   async fn send_input(
       session_id: String,
       data: Vec<u8>,
       state: tauri::State<'_, SessionManager>,
   ) -> Result<(), String> {
       state.send_data(&session_id, &data).await
   }
   ```

### Verification
- [x] SSH connection to real server works
- [x] Telnet connection works
- [x] Data flows from xterm input → Rust → server → Rust → xterm output

---

## Phase 3: Session Manager (COMPLETE)

### Goals
- Implement session tree with react-arborist
- Add session persistence
- Implement protocol switching

### Tasks

1. **Install Dependencies**
   ```bash
   npm install react-arborist uuid
   ```

2. **Define Data Structures**

   Create `src/types/session.ts`:
   ```typescript
   export interface RouterNode {
     id: string;
     mgmt_ip: string;
     name: string;
     protocol: 'telnet' | 'ssh';
     port: number;
     auth_profile: string;
     boards: LinuxBoardNode[];
   }

   export interface LinuxBoardNode {
     id: string;
     slot_id: number;
     ip: string;
     protocol: 'ssh';
   }

   export type TreeNode = {
     id: string;
     name: string;
     children?: TreeNode[];
     data: RouterNode | LinuxBoardNode;
   };
   ```

3. **Create Session Tree Component**

   Create `src/components/Sidebar/SessionTree.tsx`:
   ```typescript
   import { Tree } from 'react-arborist';
   import { useSessionStore } from '../../stores/sessionStore';

   export function SessionTree() {
     const { nodes, addRouter, removeNode } = useSessionStore();

     return (
       <Tree
         data={nodes}
         openByDefault={true}
         width="100%"
         height={600}
         indent={24}
         rowHeight={32}
       >
         {({ node, style, dragHandle }) => (
           <div style={style} ref={dragHandle}>
             <span className={`protocol-badge ${node.data.protocol}`}>
               {node.data.protocol === 'telnet' ? '[T]' : '[S]'}
             </span>
             {node.data.name}
           </div>
         )}
       </Tree>
     );
   }
   ```

4. **Implement Board Scanning**

   In `src-tauri/src/vrp.rs`:
   ```rust
   use regex::Regex;

   pub fn parse_display_device(output: &str) -> Vec<BoardInfo> {
       let re = Regex::new(r"(\d+)\s+(\S+)\s+(\d+\.\d+\.\d+\.\d+)").unwrap();
       re.captures_iter(output)
           .map(|cap| BoardInfo {
               slot_id: cap[1].parse().unwrap(),
               board_type: cap[2].to_string(),
               ip: cap[3].to_string(),
           })
           .collect()
   }
   ```

### Verification
- [x] Tree displays routers and boards
- [x] Double-click opens session
- [x] Protocol badge shows correctly
- [x] "Scan Boards" populates child nodes
- [x] Context menu (Connect, Disconnect, Scan, Remove)
- [x] VRP auto-pagination handles `---- More ----`
- [x] Sessions persist to localStorage

---

## Phase 4: Block-Based Terminal

### Goals
- Implement collapsible output blocks
- Add command input overlay
- Implement RingBuffer for backpressure
- Add Fish-like autocomplete

### Tasks

1. **Create Block Component**

   Create `src/components/Terminal/Block.tsx`:
   ```typescript
   interface BlockProps {
     command: string;
     timestamp: Date;
     status: 'success' | 'error' | 'running';
     output: string;
     collapsed: boolean;
     onToggle: () => void;
   }

   export function Block({ command, timestamp, status, output, collapsed, onToggle }: BlockProps) {
     return (
       <div className="block">
         <div className="block-header" onClick={onToggle}>
           <span className={`gutter gutter-${status}`} />
           <span className="command">{command}</span>
           <span className="timestamp">{timestamp.toLocaleTimeString()}</span>
           <span className="chevron">{collapsed ? '▶' : '▼'}</span>
         </div>
         {!collapsed && (
           <div className="block-body">
             <pre>{output}</pre>
           </div>
         )}
       </div>
     );
   }
   ```

2. **Implement RingBuffer in Rust**

   Create `src-tauri/src/buffer.rs`:
   ```rust
   pub struct RingBuffer<T> {
       buffer: Vec<Option<T>>,
       capacity: usize,
       head: usize,
       tail: usize,
       len: usize,
   }

   impl<T: Clone> RingBuffer<T> {
       pub fn new(capacity: usize) -> Self {
           Self {
               buffer: vec![None; capacity],
               capacity,
               head: 0,
               tail: 0,
               len: 0,
           }
       }

       pub fn push(&mut self, item: T) {
           self.buffer[self.tail] = Some(item);
           self.tail = (self.tail + 1) % self.capacity;
           if self.len < self.capacity {
               self.len += 1;
           } else {
               self.head = (self.head + 1) % self.capacity;
           }
       }
   }
   ```

3. **Create Input Overlay**

   Create `src/components/Terminal/InputOverlay.tsx`:
   ```typescript
   export function InputOverlay({ onSubmit, suggestions }: InputOverlayProps) {
     const [input, setInput] = useState('');
     const [showSuggestions, setShowSuggestions] = useState(false);

     return (
       <div className="input-overlay">
         <input
           value={input}
           onChange={(e) => setInput(e.target.value)}
           onKeyDown={(e) => {
             if (e.key === 'Enter') {
               onSubmit(input);
               setInput('');
             }
           }}
         />
         {showSuggestions && suggestions.length > 0 && (
           <ul className="suggestions">
             {suggestions.map((s) => <li key={s}>{s}</li>)}
           </ul>
         )}
       </div>
     );
   }
   ```

### Verification
- [ ] Commands appear as blocks
- [ ] Blocks collapse/expand on click
- [ ] Status gutter shows correct color
- [ ] Autocomplete shows history suggestions
- [ ] 100k+ lines don't cause UI freeze

---

## Phase 5: Log Tracer & Code Linkage

### Goals
- Build format-string → file:line index with tree-sitter
- Implement aho-corasick log matching
- Create React Flow visualization
- Add VS Code deep link integration

### Tasks

1. **Install Dependencies**

   Backend (add to Cargo.toml):
   ```toml
   tree-sitter = "0.22"
   tree-sitter-c = "0.21"
   aho-corasick = "1"
   ```

   Frontend:
   ```bash
   npm install reactflow
   ```

2. **Implement Code Indexer**

   Create `src-tauri/src/tracer.rs`:
   ```rust
   use aho_corasick::AhoCorasick;
   use std::collections::HashMap;
   use tree_sitter::{Parser, Query, QueryCursor};

   pub struct LogTracer {
       index: HashMap<String, SourceLocation>,
       matcher: Option<AhoCorasick>,
   }

   #[derive(Debug, Clone)]
   pub struct SourceLocation {
       pub file: String,
       pub line: u32,
       pub function: String,
   }

   impl LogTracer {
       pub fn new() -> Self {
           Self {
               index: HashMap::new(),
               matcher: None,
           }
       }

       pub fn index_directory(&mut self, path: &str) -> Result<(), String> {
           let mut parser = Parser::new();
           parser.set_language(&tree_sitter_c::language()).unwrap();

           // Walk directory, parse files, extract printf format strings
           // Build index mapping format string -> SourceLocation

           // After indexing, build AhoCorasick matcher
           let patterns: Vec<_> = self.index.keys().collect();
           self.matcher = Some(AhoCorasick::new(&patterns).unwrap());

           Ok(())
       }

       pub fn match_log(&self, log_line: &str) -> Option<&SourceLocation> {
           let matcher = self.matcher.as_ref()?;
           matcher.find(log_line)
               .and_then(|m| self.index.get(m.pattern().as_str()))
       }
   }
   ```

3. **Create Flow Visualization**

   Create `src/components/Panel/FlowPanel.tsx`:
   ```typescript
   import ReactFlow, { Node, Edge } from 'reactflow';
   import 'reactflow/dist/style.css';

   export function FlowPanel({ traces }: { traces: TraceEvent[] }) {
     const nodes: Node[] = traces.map((t, i) => ({
       id: `${i}`,
       position: { x: 100, y: i * 80 },
       data: { label: `${t.function}\n${t.file}:${t.line}` },
     }));

     const edges: Edge[] = traces.slice(1).map((_, i) => ({
       id: `e${i}`,
       source: `${i}`,
       target: `${i + 1}`,
     }));

     return (
       <div className="h-full">
         <ReactFlow nodes={nodes} edges={edges} fitView />
       </div>
     );
   }
   ```

4. **Add VS Code Deep Link**

   Create `src/utils/vscode.ts`:
   ```typescript
   export function openInVSCode(file: string, line: number, remote?: string) {
     const authority = remote || 'file';
     const url = `vscode://file/${file}:${line}`;
     window.open(url);
   }
   ```

### Verification
- [ ] Indexing C project completes without error
- [ ] Log lines highlight when matched
- [ ] Flow diagram updates in real-time
- [ ] Click node → VS Code opens at correct line

---

## Data Structures Reference

### Rust Types

```rust
// src-tauri/src/session.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterNode {
    pub id: String,
    pub mgmt_ip: String,
    pub name: String,
    pub protocol: Protocol,
    pub port: u16,
    pub auth_profile: String,
    pub boards: Vec<LinuxBoardNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxBoardNode {
    pub id: String,
    pub slot_id: u32,
    pub ip: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Protocol {
    Telnet,
    Ssh,
}
```

### TypeScript Types

```typescript
// src/types/session.ts
interface RouterNode {
  id: string;
  mgmt_ip: string;
  name: string;
  protocol: 'telnet' | 'ssh';
  port: number;
  auth_profile: string;
  boards: LinuxBoardNode[];
}

interface LinuxBoardNode {
  id: string;
  slot_id: number;
  ip: string;
  protocol: 'ssh';
}

interface ThemeConfig {
  mode: 'glass' | 'image' | 'solid';
  acrylicOpacity: number;
  blurStrength: number;
  fontFamily: string;
}

interface Block {
  id: string;
  command: string;
  timestamp: Date;
  status: 'success' | 'error' | 'running';
  output: string;
  collapsed: boolean;
}

interface TraceEvent {
  file: string;
  line: number;
  function: string;
  timestamp: Date;
  matched_text: string;
}
```

---

## Testing Strategy

### Mock Server (Docker)
```dockerfile
FROM python:3.11-slim
COPY mock_vrp.py /app/
WORKDIR /app
EXPOSE 23
CMD ["python", "mock_vrp.py"]
```

```python
# mock_vrp.py
import socket
import threading

def handle_client(conn):
    conn.send(b"<Huawei>")
    while True:
        data = conn.recv(1024)
        if b"display" in data:
            conn.send(b"---- More ----")
            # Wait for space
            conn.recv(1)
            conn.send(b"\nSlot  Type    IP\n1     Board   192.168.1.10\n<Huawei>")

server = socket.socket()
server.bind(('0.0.0.0', 23))
server.listen(5)
while True:
    conn, addr = server.accept()
    threading.Thread(target=handle_client, args=(conn,)).start()
```

### Testing Milestones

| Phase | Test | Pass Criteria | Status |
|-------|------|---------------|--------|
| 1 | Visual inspection | Glass effect visible, grid responsive | PASS |
| 2 | SSH/Telnet connection | Real server echo works | PASS |
| 3 | Tree operations | Add/remove/switch persists, VRP pagination | PASS |
| 4 | Stress test | 100k lines, no freeze | - |
| 5 | Log matching | Index C project, link works | - |
