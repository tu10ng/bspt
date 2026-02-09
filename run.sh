#!/bin/bash
# BSPT Development Launcher
# Sets GDK_BACKEND=x11 to fix GTK/WebKit rendering issues on Wayland

export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
pnpm tauri dev
