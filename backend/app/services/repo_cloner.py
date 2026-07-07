import os
import shutil
import tempfile
import git
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)

# File size limit in bytes (500 KB)
FILE_SIZE_LIMIT = 500 * 1024

# Allowed source file extensions
ALLOWED_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx"}

# Folders to completely skip
SKIPPED_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "venv",
    "__pycache__",
    ".next",
    ".agents",
    "out",
    "target",
}

def remove_readonly(func, path, excinfo):
    """
    Error handler for shutil.rmtree to deal with read-only file locks,
    which is extremely common under Windows with GitPython .git directories.
    """
    import stat
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as e:
        logger.warning(f"Failed to force remove path {path}: {e}")

class RepoCloner:
    def __init__(self, github_url: str):
        self.github_url = github_url
        self.temp_dir = None

    def clone(self) -> str:
        """Clones the repository and returns the path to the cloned directory."""
        self.temp_dir = tempfile.mkdtemp(prefix="syntree_clone_")
        try:
            logger.info(f"Cloning {self.github_url} into temporary directory {self.temp_dir}...")
            # Strip query parameters (like ?limit=50) for the actual git clone operation
            clone_url = self.github_url.split("?")[0]
            git.Repo.clone_from(clone_url, self.temp_dir, depth=1)
            logger.info("Clone completed successfully.")
            return self.temp_dir
        except Exception as e:
            self.cleanup()
            logger.error(f"Failed to clone repository: {e}")
            raise ValueError(f"Failed to clone repository: {str(e)}")

    def get_source_files(self) -> List[Tuple[str, str]]:
        """
        Walks the cloned repository and returns a list of tuples:
        (relative_file_path, file_content_text)
        """
        if not self.temp_dir or not os.path.exists(self.temp_dir):
            raise ValueError("Repository has not been cloned yet or temp directory does not exist.")

        source_files = []
        for root, dirs, files in os.walk(self.temp_dir):
            # Prune skipped directories in-place to avoid descending into them
            dirs[:] = [d for d in dirs if d not in SKIPPED_DIRS]

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext not in ALLOWED_EXTENSIONS:
                    continue

                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.temp_dir).replace("\\", "/")

                # Skip files exceeding size cap
                try:
                    if os.path.getsize(full_path) > FILE_SIZE_LIMIT:
                        logger.info(f"Skipping {rel_path} as it exceeds the 500KB size limit.")
                        continue
                except OSError:
                    continue

                # Read and verify if it's text
                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                        # Simple binary check (look for null byte)
                        if "\x00" in content:
                            logger.info(f"Skipping binary/non-text file {rel_path}.")
                            continue
                        source_files.append((rel_path, content))
                except Exception as e:
                    logger.warning(f"Error reading file {rel_path}: {e}")
                    continue

        return source_files

    def cleanup(self):
        """Cleans up the temporary directory."""
        if self.temp_dir and os.path.exists(self.temp_dir):
            logger.info(f"Cleaning up temporary directory {self.temp_dir}...")
            shutil.rmtree(self.temp_dir, onerror=remove_readonly)
            self.temp_dir = None
