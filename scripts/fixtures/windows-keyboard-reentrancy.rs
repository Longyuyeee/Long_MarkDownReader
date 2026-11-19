//! Exercise sent focus messages inside Tao's keyboard message peeks.
//! Run only in a disposable Windows CI session, using this process's own window.
#![cfg(windows)]

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tao::{
    event_loop::{ControlFlow, EventLoop},
    platform::{run_return::EventLoopExtRunReturn, windows::WindowExtWindows},
    window::WindowBuilder,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    PostMessageW, SendMessageTimeoutW, SMTO_ABORTIFHUNG, WM_KEYDOWN, WM_KEYUP,
    WM_KILLFOCUS, WM_NULL, WM_SETFOCUS,
};

fn main() {
    assert_eq!(std::env::var("GITHUB_ACTIONS").as_deref(), Ok("true"));
    let mut event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("LongEdit keyboard reentrancy regression")
        .with_visible(false)
        .build(&event_loop)
        .expect("create isolated Tao window");
    let hwnd = window.hwnd() as usize;
    let stop = Arc::new(AtomicBool::new(false));
    let key_cycles = Arc::new(AtomicU64::new(0));
    let focus_messages = Arc::new(AtomicU64::new(0));
    let duration = Duration::from_secs(20);
    let start = Instant::now();

    let key_stop = stop.clone();
    let keys = key_cycles.clone();
    let key_worker = thread::spawn(move || {
        while !key_stop.load(Ordering::Relaxed) {
            unsafe {
                PostMessageW(hwnd as _, WM_KEYDOWN, b'A' as usize, 1 | (0x1e << 16));
                PostMessageW(hwnd as _, WM_KEYUP, b'A' as usize, 1 | (0x1e << 16) | (3 << 30));
            }
            keys.fetch_add(1, Ordering::Relaxed);
            thread::sleep(Duration::from_millis(1));
        }
    });

    let mut focus_workers = Vec::new();
    for _ in 0..2 {
        let focus_stop = stop.clone();
        let messages = focus_messages.clone();
        focus_workers.push(thread::spawn(move || {
            while !focus_stop.load(Ordering::Relaxed) {
                for message in [WM_KILLFOCUS, WM_SETFOCUS] {
                    let mut result = 0;
                    unsafe {
                        SendMessageTimeoutW(hwnd as _, message, 0, 0, SMTO_ABORTIFHUNG, 200, &mut result);
                    }
                    messages.fetch_add(1, Ordering::Relaxed);
                }
                thread::yield_now();
            }
        }));
    }

    let watchdog_stop = stop.clone();
    let watchdog = thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        let mut misses = 0;
        while !watchdog_stop.load(Ordering::Relaxed) {
            if start.elapsed() >= duration {
                // Continuous sent messages may keep MainEventsCleared from firing.
                // End the pressure independently so the event loop can drain.
                watchdog_stop.store(true, Ordering::Relaxed);
                unsafe { PostMessageW(hwnd as _, WM_NULL, 0, 0); }
                break;
            }
            let mut result = 0;
            let responded = unsafe {
                SendMessageTimeoutW(hwnd as _, WM_NULL, 0, 0, SMTO_ABORTIFHUNG, 500, &mut result)
            };
            misses = if responded == 0 { misses + 1 } else { 0 };
            if misses >= 4 {
                eprintln!("keyboard-focus-deadlock");
                std::process::exit(42);
            }
            thread::sleep(Duration::from_millis(100));
        }
    });

    event_loop.run_return(|_, _, control_flow| {
        *control_flow = ControlFlow::Poll;
        if start.elapsed() >= duration {
            stop.store(true, Ordering::Relaxed);
            *control_flow = ControlFlow::Exit;
        }
    });
    stop.store(true, Ordering::Relaxed);
    key_worker.join().unwrap();
    for worker in focus_workers {
        worker.join().unwrap();
    }
    watchdog.join().unwrap();
    let keys = key_cycles.load(Ordering::Relaxed);
    let messages = focus_messages.load(Ordering::Relaxed);
    assert!(keys >= 1000 && messages >= 1000, "insufficient input pressure");
    println!("responsive key_cycles={keys} focus_messages={messages}");
}
