//! DWO Library - Developer Workflow Orchestrator
//!
//! Core library containing terminal management, file system operations,
//! workspace management, licensing functionality, and multi-agent orchestration.

#![cfg_attr(mobile, tauri::mobile_entry_point)]

pub mod terminal;
pub mod fs;
pub mod state;
pub mod env;
pub mod events;
pub mod license;
pub mod agents;
pub mod git;
pub mod tasks;
pub mod plugins;
pub mod diagnostics;
pub mod workspace;
pub mod lsp;
pub mod handoff;

use std::path::PathBuf;
use std::fs::File;
use std::io::Write;
use std::panic;
use tauri::Manager;

/// Initialize the application
pub fn run() {
    setup_panic_hook();
    // GUI launches (Finder/Dock) inherit launchd's minimal PATH — expand it
    // before any child process (git, language servers, PTY shells) spawns.
    env::harden_process_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Ensure data directory exists
            let data_dir = dirs::config_dir()
                .map(|d| d.join("dwo"))
                .unwrap_or_else(|| PathBuf::from("/tmp/dwo"));
            std::fs::create_dir_all(&data_dir)?;

            // Initialize terminal manager (needs AppHandle to emit output events)
            let terminal_manager = terminal::TerminalManager::new(app.handle().clone());
            app.manage(terminal_manager);

            // Initialize state manager (managed as Mutex so commands can mutate it)
            let state = std::sync::Mutex::new(state::state::AppState::load().unwrap_or_default());
            app.manage(state);

            // Initialize workspace index (workspace ↔ session persistence)
            let workspace_index = workspace::WorkspaceIndex::new();
            app.manage(workspace_index);

            // Initialize license manager
            let license_manager = license::license::LicenseManager::new();
            app.manage(license_manager);

            // Initialize agent manager (Phase 4)
            let agent_manager = agents::AgentManager::new();
            app.manage(agent_manager);

            // Git manager is created per-call in commands (no shared state needed)

            // Initialize task manager (Phase 9)
            let task_manager = tasks::TaskManager::new();
            app.manage(task_manager);

            // Initialize plugin manager (Phase 11)
            let plugin_manager = plugins::PluginManager::new();
            app.manage(plugin_manager);

            // Initialize the file watcher (debounced `file-changed` events)
            let watch_manager = events::watcher::WatchManager::new(app.handle().clone());
            app.manage(watch_manager);

            // Initialize the language-server manager (stdio children relayed
            // over `lsp-stdout` / `lsp-exit`; killed on stop, unwatch and exit)
            let lsp_manager = lsp::LspManager::new(app.handle().clone());
            app.manage(lsp_manager);

            // Initialize handoff manager (persists artifacts to ~/.config/dwo/handoffs/)
            let handoff_data_dir = dirs::config_dir()
                .map(|d| d.join("dwo").join("handoffs"))
                .unwrap_or_else(|| std::path::PathBuf::from("/tmp/dwo/handoffs"));
            let handoff_manager = handoff::HandoffManager::new(handoff_data_dir);
            app.manage(handoff_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Terminal commands
            terminal::commands::terminal_create,
            terminal::commands::terminal_attach,
            terminal::commands::terminal_detach,
            terminal::commands::terminal_write,
            terminal::commands::terminal_send_command,
            terminal::commands::terminal_resize,
            terminal::commands::terminal_close,
            terminal::commands::terminal_list,
            terminal::commands::terminal_get_scrollback,
            terminal::commands::terminal_set_title,
            terminal::commands::terminal_set_tui,
            terminal::commands::terminal_set_focus,
            terminal::commands::terminal_set_visible,
            terminal::commands::terminal_drop_files,
            // Handoff commands
            handoff::commands::handoff_capture,
            handoff::commands::handoff_list,
            handoff::commands::handoff_get,
            handoff::commands::handoff_inject,
            handoff::commands::handoff_delete,
            // File system commands
            fs::commands::list_dir,
            fs::commands::get_home,
            fs::commands::read_file,
            fs::commands::write_file,
            fs::commands::create_file,
            fs::commands::create_dir,
            fs::commands::rename,
            fs::commands::delete,
            fs::commands::search,
            fs::commands::search_files,
            fs::commands::list_tree,
            // File watching commands
            events::commands::watch_path,
            events::commands::unwatch_path,
            // Language server commands
            lsp::commands::lsp_start,
            lsp::commands::lsp_write,
            lsp::commands::lsp_stop,
            // Workspace commands
            state::commands::create_workspace,
            state::commands::rename_workspace,
            state::commands::close_workspace,
            state::commands::load_workspace_state,
            state::commands::save_workspace_state,
            state::commands::list_workspaces,
            state::commands::get_workspace_state,
            state::commands::activate_workspace,
            state::commands::select_workspace_folder,
            state::commands::update_workspace,
            state::commands::get_launch_cwd,
            // Workspace index commands
            workspace::commands::workspace_index_set,
            workspace::commands::workspace_index_set_pane,
            workspace::commands::workspace_index_get,
            workspace::commands::workspace_index_get_pane,
            workspace::commands::workspace_index_remove_session,
            workspace::commands::workspace_index_clear,
            // License commands
            license::commands::activate,
            license::commands::status,
            license::commands::deactivate,
            // Agent commands
            agents::commands::agent_list_tasks,
            agents::commands::agent_get_task,
            agents::commands::agent_create_task,
            agents::commands::agent_update_task,
            agents::commands::agent_list_configs,
            agents::commands::agent_add_config,
            agents::commands::agent_remove_config,
            // Git commands
            git::commands::git_status,
            git::commands::git_stage,
            git::commands::git_unstage,
            git::commands::git_commit,
            git::commands::git_log,
            git::commands::git_branch,
            // Task commands
            tasks::commands::task_list,
            tasks::commands::task_get,
            tasks::commands::task_create,
            tasks::commands::task_update_status,
            tasks::commands::task_delete,
            tasks::commands::task_save_result,
            tasks::commands::task_get_results,
            // Plugin commands
            plugins::commands::plugin_list,
            plugins::commands::plugin_get,
            plugins::commands::plugin_install,
            plugins::commands::plugin_remove,
            plugins::commands::plugin_toggle,
            plugins::commands::plugin_enabled,
            // Diagnostics commands
            diagnostics::commands::frontend_error,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dwo");
    eprintln!("[DWO] App run completed");
}

/// Set up a non-aborting panic hook that logs to ~/.config/dwo/rust-panics.log
fn setup_panic_hook() {
    panic::set_hook(Box::new(|info| {
        eprintln!("[DWO PANIC HOOK] Panic detected!");
        eprintln!("[DWO PANIC HOOK] Info: {:?}", info);

        let log_path = dirs::config_dir()
            .map(|d| d.join("dwo").join("rust-panics.log"))
            .unwrap_or_else(|| PathBuf::from("/tmp/dwo-panics.log"));

        if let Ok(mut file) = File::options()
            .append(true)
            .create(true)
            .open(&log_path)
        {
            let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let location = if let Some(loc) = info.location() {
                format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
            } else {
                "unknown".to_string()
            };
            let payload = info.payload()
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_string());

            let _ = writeln!(file, "[{}] Panic at {}: {}", timestamp, location, payload);

            if payload.contains("cannot unwind") {
                let _ = writeln!(file, "[{}] Backtrace:", timestamp);
                let _ = writeln!(file, "{}", std::backtrace::Backtrace::force_capture());
            }
        }
    }));

    // Log uncaught NSExceptions (foreign Obj-C exceptions) to the same file.
    #[cfg(target_os = "macos")]
    unsafe {
        use objc2::runtime::AnyObject;

        static mut HANDLER_SET: bool = false;
        if HANDLER_SET {
            return;
        }
        HANDLER_SET = true;

        extern "C" fn dwo_uncaught_exception(exception: *const AnyObject) {
            let log_path = dirs::config_dir()
                .map(|d| d.join("dwo").join("rust-panics.log"))
                .unwrap_or_else(|| PathBuf::from("/tmp/dwo-panics.log"));
            if let Ok(mut file) = File::options()
                .append(true)
                .create(true)
                .open(&log_path)
            {
                let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
                let text = if exception.is_null() {
                    "<null exception>".to_string()
                } else {
                    unsafe {
                        use objc2::msg_send;
                        let desc: Option<objc2::rc::Retained<objc2::runtime::NSObject>> =
                            msg_send![exception.as_ref().unwrap(), description];
                        desc.and_then(|d| {
                            let ptr: *const std::ffi::c_char =
                                msg_send![&d, UTF8String];
                            if ptr.is_null() {
                                None
                            } else {
                                Some(std::ffi::CStr::from_ptr(ptr).to_string_lossy().to_string())
                            }
                        })
                        .unwrap_or_else(|| "<exception>".to_string())
                    }
                };
                let _ = writeln!(file, "[{}] NSException: {}", timestamp, text);
            }
        }

        extern "C" {
            fn NSSetUncaughtExceptionHandler(
                handler: Option<extern "C" fn(*const AnyObject)>,
            );
        }
        NSSetUncaughtExceptionHandler(Some(dwo_uncaught_exception));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_panic_hook_setup() {
        assert!(true);
    }
}
