import os
import logging
from typing import List, Dict, Any
from tree_sitter_languages import get_parser

logger = logging.getLogger(__name__)

class CodeChunk:
    def __init__(
        self,
        file_path: str,
        start_line: int,
        end_line: int,
        language: str,
        kind: str,
        content: str,
        imports: List[str],
    ):
        self.file_path = file_path
        self.start_line = start_line
        self.end_line = end_line
        self.language = language
        self.kind = kind
        self.content = content
        self.imports = imports

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "language": self.language,
            "kind": self.kind,
            "content": self.content,
            "imports": self.imports,
        }

def get_node_name(node, source_bytes) -> str:
    """Helper to extract a node's name identifier."""
    name_node = node.child_by_field_name("name")
    if name_node:
        return source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
    return ""

def walk_tree(node, source_bytes, chunks: List[CodeChunk], imports: List[str], file_path: str, language: str):
    node_type = node.type
    is_chunk = False
    kind = ""

    if language == "python":
        if node_type == "function_definition":
            is_chunk = True
            kind = "function"
        elif node_type == "class_definition":
            is_chunk = True
            kind = "class"
        elif node_type in ("import_statement", "import_from_statement"):
            import_text = source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
            imports.append(import_text.strip())

    elif language in ("javascript", "typescript", "tsx"):
        if node_type == "function_declaration":
            is_chunk = True
            name = get_node_name(node, source_bytes)
            if name and name[0].isupper():
                kind = "component"
            else:
                kind = "function"
        elif node_type == "class_declaration":
            is_chunk = True
            kind = "class"
        elif node_type in ("lexical_declaration", "variable_declaration"):
            # Inspect declarators for arrow functions or function expressions
            for child in node.children:
                if child.type == "variable_declarator":
                    value_node = child.child_by_field_name("value")
                    if value_node and value_node.type in ("arrow_function", "function_expression"):
                        is_chunk = True
                        name_node = child.child_by_field_name("id") or child.child_by_field_name("name")
                        name = ""
                        if name_node:
                            name = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
                        if name and name[0].isupper():
                            kind = "component"
                        else:
                            kind = "function"
                        break
        elif node_type == "import_statement":
            import_text = source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
            imports.append(import_text.strip())

    if is_chunk:
        content = source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
        chunks.append(
            CodeChunk(
                file_path=file_path,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
                language=language,
                kind=kind,
                content=content,
                imports=[],  # Will populate later
            )
        )
        return

    for child in node.children:
        walk_tree(child, source_bytes, chunks, imports, file_path, language)

def make_whole_file_chunk(file_path: str, content: str, language: str) -> CodeChunk:
    """Fallback chunk representing the entire file."""
    imports = []
    lines = content.splitlines()
    for line in lines:
        stripped = line.strip()
        if language == "python" and (stripped.startswith("import ") or stripped.startswith("from ")):
            imports.append(stripped)
        elif language in ("javascript", "typescript", "tsx") and stripped.startswith("import "):
            imports.append(stripped)

    return CodeChunk(
        file_path=file_path,
        start_line=1,
        end_line=len(lines) if lines else 1,
        language=language,
        kind="file",
        content=content,
        imports=imports,
    )

class Chunker:
    @staticmethod
    def chunk_file(file_path: str, content: str) -> List[CodeChunk]:
        ext = os.path.splitext(file_path)[1].lower()
        
        # Map file extensions to tree-sitter parser names
        lang_map = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "tsx",
        }
        language = lang_map.get(ext)

        if not language:
            # Fallback for unsupported extensions
            wf = make_whole_file_chunk(file_path, content, "unknown")
            wf.content = wf.content.strip()
            return [wf] if len(wf.content) >= 10 else []

        try:
            parser = get_parser(language)
            source_bytes = content.encode("utf-8")
            tree = parser.parse(source_bytes)
            
            chunks: List[CodeChunk] = []
            imports: List[str] = []
            
            walk_tree(tree.root_node, source_bytes, chunks, imports, file_path, language)

            # If no chunks were generated, treat the whole file as one chunk
            if not chunks:
                chunks = [make_whole_file_chunk(file_path, content, language)]

            # Filter chunks: strip whitespace and ensure content is >= 10 characters
            filtered_chunks: List[CodeChunk] = []
            for chunk in chunks:
                chunk.content = chunk.content.strip()
                if len(chunk.content) >= 10:
                    filtered_chunks.append(chunk)

            # If all AST chunks were too small, fall back to the whole file if it is large enough
            if not filtered_chunks:
                wf = make_whole_file_chunk(file_path, content, language)
                wf.content = wf.content.strip()
                if len(wf.content) >= 10:
                    filtered_chunks.append(wf)

            # Populate imports on all remaining chunks
            for chunk in filtered_chunks:
                chunk.imports = imports

            return filtered_chunks
        except Exception as e:
            logger.warning(f"Failed to tree-sitter parse {file_path}, using whole-file fallback. Error: {e}")
            wf = make_whole_file_chunk(file_path, content, language or "unknown")
            wf.content = wf.content.strip()
            return [wf] if len(wf.content) >= 10 else []
