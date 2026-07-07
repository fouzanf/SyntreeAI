"use client";

import React, { useState } from "react";
import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  initialCode?: string;
  language?: string;
  theme?: string;
  onChange?: (value: string | undefined) => void;
}

export default function CodeEditor({
  initialCode = "// Start typing code here...\nconsole.log('Hello World!');",
  language = "javascript",
  theme = "vs-dark",
  onChange
}: CodeEditorProps) {
  const [value, setValue] = useState<string | undefined>(initialCode);

  const handleEditorChange = (val: string | undefined) => {
    setValue(val);
    if (onChange) {
      onChange(val);
    }
  };

  return (
    <div className="w-full h-full min-h-[400px] border border-zinc-800 rounded-lg overflow-hidden bg-[#1e1e1e]">
      <Editor
        height="100%"
        width="100%"
        language={language}
        theme={theme}
        value={value}
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 16, bottom: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-zinc-400 p-4">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
