fn main() {
    println!("cargo:rerun-if-changed=../out");
    println!("cargo:rerun-if-changed=../out/index.html");
    tauri_build::build();
}

