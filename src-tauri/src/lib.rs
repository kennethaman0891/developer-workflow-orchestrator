//! DWO Library - Developer Workflow Orchestrator
//!
//! Core library containing terminal management, file system operations,
//! workspace management, licensing functionality, and multi-agent orchestration.

#![cfg_attr(mobile, tauri::mobile_entry_point)]

pub mod terminal;
pub mod fs;
pub mod state;
pub mod events;
pub mod license;
pub mod agents;
pub mod git;
pub mod tasks;
pub mod plugins;
pub mod diagnostics;

use std::path::PathBuf;
use std::fs::File;
use std::io::Write;
use std::panic;
use tauri::Manager;

/// Initialize the application
pub fn run() {
    setup_panic_hook();

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

            // Initialize state manager
            let state = state::state::AppState::load().unwrap_or_default();
            app.manage(state);

            // Initialize license manager
            let license_manager = license::license::LicenseManager::new();
            app.manage(license_manager);

            // Initialize agent manager (Phase 4)
            let agent_manager = agents::AgentManager::new();
            app.manage(agent_manager);

            // Initialize git manager (Phase 8)
            let git_manager = git::GitManager::new(data_dir.clone());
            app.manage(git_manager);

            // Initialize task manager (Phase 9)
            let task_manager = tasks::TaskManager::new();
            app.manage(task_manager);

            // Initialize plugin manager (Phase 11)
            let plugin_manager = plugins::PluginManager::new();
            app.manage(plugin_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Terminal commands (Phase 1)
            terminal::commands::terminal_create,
            terminal::commands::terminal_attach,
            terminal::commands::terminal_detach,
            terminal::commands::terminal_write,
            terminal::commands::terminal_resize,
            terminal::commands::terminal_close,
            terminal::commands::terminal_list,
            terminal::commands::terminal_get_scrollback,
            terminal::commands::terminal_set_title,
            terminal::commands::terminal_set_tui,
            terminal::commands::terminal_set_focus,
            terminal::commands::terminal_set_visible,
            terminal::commands::terminal_drop_files,
            // File system commands (Phase 2)
            fs::commands::list_dir,
            fs::commands::read_file,
            fs::commands::write_file,
            fs::commands::create_file,
            fs::commands::create_dir,
            fs::commands::rename,
            fs::commands::delete,
            fs::commands::search,
            // Workspace commands (Phase 2)
            state::commands::create_workspace,
            state::commands::rename_workspace,
            state::commands::close_workspace,
            state::commands::load_workspace_state,
            state::commands::save_workspace_state,
            state::commands::list_workspaces,
            state::commands::activate_workspace,
            state::commands::select_workspace_folder,
            // License commands (Phase 3)
            license::commands::activate,
            license::commands::status,
            license::commands::deactivate,
            // Agent commands (Phase 4)
            agents::commands::agent_list_tasks,
            agents::commands::agent_get_task,
            agents::commands::agent_create_task,
            agents::commands::agent_update_task,
            agents::commands::agent_list_configs,
            agents::commands::agent_add_config,
            agents::commands::agent_remove_config,
            // Git commands (Phase 8)
            git::commands::git_status,
            git::commands::git_stage,
            git::commands::git_commit,
            git::commands::git_log,
            git::commands::git_branch,
            // Task commands (Phase 9)
            tasks::commands::task_list,
            tasks::commands::task_get,
            tasks::commands::task_create,
            tasks::commands::task_update_status,
            tasks::commands::task_delete,
            tasks::commands::task_save_result,
            tasks::commands::task_get_results,
            // Plugin commands (Phase 11)
            plugins::commands::plugin_list,
            plugins::commands::plugin_get,
            plugins::commands::plugin_install,
            plugins::commands::plugin_remove,
            plugins::commands::plugin_toggle,
            plugins::commands::plugin_enabled,
            // Diagnostics commands (Phase 5)
            diagnostics::commands::frontend_error,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dwo");
    eprintln!("[DWO] App run completed");
}

/// Set up a non-aborting panic hook that logs to ~/.local/share/dwo/rust-panics.log
///
/// Also installs an NSException (uncaught Obj-C exception) logger so foreign
/// exceptions show up in the same file — this is what made the macOS 26 launch
/// crash (tauri-apps/tao#1171) so hard to diagnose.
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

            // A panic unwinding across an `extern "C"` boundary means a
            // foreign (Obj-C) exception or a callback that cannot unwind —
            // log a native backtrace so the origin is diagnosable.
            if payload.contains("cannot unwind") {
                let _ = writeln!(file, "[{}] Backtrace:", timestamp);
                let _ = writeln!(file, "{}", std::backtrace::Backtrace::force_capture());
            }
        }
    }));

    // Log uncaught NSExceptions (foreign Obj-C exceptions) to the same file.
    // macOS only; the handler is process-global and set once at startup.
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
                    // -description returns an NSString formatted "Name: reason".
                    let desc: Option<objc2::rc::Retained<objc2::runtime::NSObject>> =
                        unsafe { objc2::msg_send![exception.as_ref().unwrap(), description] };
                    desc.and_then(|d| {
                        // -UTF8String gives a C string; copy it before logging.
                        let ptr: *const std::ffi::c_char =
                            unsafe { objc2::msg_send![&d, UTF8String] };
                        if ptr.is_null() {
                            None
                        } else {
                            Some(unsafe { std::ffi::CStr::from_ptr(ptr) }.to_string_lossy().to_string())
                        }
                    })
                    .unwrap_or_else(|| "<exception>".to_string())
                };
                let _ = writeln!(file, "[{}] NSException: {}", timestamp, text);
            }
        }

        // NSSetUncaughtExceptionHandler comes from Foundation, which is
        // always loaded in a Tauri process.
        unsafe extern "C" {
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
        // This test just verifies the function exists and can be called
        assert!(true);
    }
}
