import os
import shutil
from pathlib import Path

def copy_with_structure(src, dest_root, rel_root):
    """
    Copy a file or folder into dest_root, preserving relative structure.
    """
    src_path = Path(src)
    rel_path = src_path.relative_to(rel_root)
    dest_path = Path(dest_root) / rel_path

    if src_path.is_dir():
        shutil.copytree(src_path, dest_path, dirs_exist_ok=True)
    elif src_path.is_file():
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dest_path)

def main():
    # Adjust these to match your environment
    desktop = Path.home() / "Desktop"
    dest_root = desktop / "context-persistence-files"
    project_root = Path(r"C:\Users\avoca\fight-mobile-app")

    # Ensure destination exists
    dest_root.mkdir(parents=True, exist_ok=True)

    # List of important sources to copy
    sources = [
        project_root / "projectContext.md",
        project_root / "packages" / "backend" / "prisma" / "schema.prisma",
        project_root / "packages" / "backend" / "src" / "routes",
        project_root / "packages" / "mobile" / "app",
        project_root / "packages" / "shared" / "src" / "types",
        project_root / "packages" / "backend" / "src" / "middleware" / "auth.ts",
        project_root / "packages" / "mobile" / "store" / "AuthContext.tsx",
    ]

    # Copy each file/folder
    for src in sources:
        if src.exists():
            copy_with_structure(src, dest_root, project_root)
            print(f"✅ Copied {src}")
        else:
            print(f"⚠️ Skipped missing: {src}")

    print(f"\nAll done! Files collected in: {dest_root}")

if __name__ == "__main__":
    main()
