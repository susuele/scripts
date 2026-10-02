// ==UserScript==
// @name         Gemini Markdown Export
// @namespace    https://github.com/susuele/scripts/userscripts/gemini-markdown-export
// @version      1.1.2
// @description  Copy or export Gemini chat and Deep Research canvas to Markdown.
// @author       faithleysath
// @match        https://gemini.google.com/*
// @icon         https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg
// @grant        none
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/susuele/scripts/tree/main/userscripts/gemini-markdown-export
// @supportURL   https://github.com/susuele/scripts/issues
// @downloadURL  https://raw.githubusercontent.com/susuele/scripts/main/userscripts/gemini-markdown-export/gemini-markdown-export.user.js
// @updateURL    https://raw.githubusercontent.com/susuele/scripts/main/userscripts/gemini-markdown-export/gemini-markdown-export.user.js
// ==/UserScript==
// Original project / namespace: https://github.com/faithleysath/gemini-to-markdown
(function () {
  if (window.__GEMINI_EXPORT_TIMER__) {
    clearInterval(window.__GEMINI_EXPORT_TIMER__);
  }
  // === 终极通用版：HTML 转 Markdown ===
  function htmlToMarkdown(rootElement) {
    if (!rootElement) return "";

    const IGNORE_TAGS = [
      "SOURCES-CAROUSEL-INLINE",
      "SOURCES-CAROUSEL",
      "BUTTON",
      "MAT-ICON",
      "STYLE",
      "SCRIPT",
      "svg",
    ];

    function traverse(node, context = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (context.inPre) return node.textContent;
        return node.textContent.replace(/\n/g, " ").replace(/\s+/g, " ");
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toUpperCase();

      if (IGNORE_TAGS.includes(tag)) return "";
      if (node.classList.contains("ProseMirror-trailingBreak")) return "";

      if (tag === "RESPONSE-ELEMENT") {
        let inner = "";
        node.childNodes.forEach((child) => (inner += traverse(child, context)));
        return inner;
      }

      if (node.hasAttribute("data-math")) {
        const latex = node.getAttribute("data-math");
        const isBlock =
          tag === "MATH-BLOCK" ||
          node.classList.contains("math-block") ||
          node.style.display === "block";

        if (isBlock) {
          return `\n\n$$\n${latex}\n$$\n\n`;
        } else {
          return `$${latex}$`;
        }
      }

      if (tag === "INPUT" && node.type === "checkbox") {
        return node.checked ? "[x] " : "[ ] ";
      }

      if (tag === "SUP" && node.hasAttribute("data-turn-source-index")) {
        const index = node.getAttribute("data-turn-source-index");
        return `[^${index}]`;
      }

      if (tag === "IMG") {
        const alt = node.getAttribute("alt") || "";
        const src = node.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }

      if (tag === "BR") return "  \n";
      if (tag === "HR") return "\n\n---\n\n";

      if (tag === "CODE-BLOCK" || tag === "PRE") {
        const codeEl = node.querySelector("code") || node;
        let lang = "";
        const langMatch = (codeEl.className || "").match(
          /language-([a-z0-9]+)/i,
        );
        lang = langMatch ? langMatch[1] : "";
        const content = codeEl.innerText || codeEl.textContent;
        return `\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n`;
      }

      if (tag === "TABLE") {
        const rows = Array.from(node.querySelectorAll("tr"));
        let mdTable = "\n";
        rows.forEach((row, i) => {
          const cells = Array.from(row.querySelectorAll("th, td"));
          const rowText =
            "| " +
            cells.map((c) => traverse(c, context).trim()).join(" | ") +
            " |";
          mdTable += rowText + "\n";
          if (i === 0) {
            mdTable +=
              "| " +
              cells
                .map((cell) => {
                  const style = cell.getAttribute("style") || "";
                  if (style.includes("center")) return ":---:";
                  if (style.includes("right")) return "---:";
                  return "---";
                })
                .join(" | ") +
              " |\n";
          }
        });
        return mdTable + "\n";
      }

      let childrenContent = "";
      const newContext = {
        ...context,
        inPre: context.inPre || tag === "PRE" || tag === "CODE-BLOCK",
        inList: context.inList || tag === "LI",
      };

      node.childNodes.forEach((child) => {
        childrenContent += traverse(child, newContext);
      });

      switch (tag) {
        case "H1": return `\n# ${childrenContent}\n`;
        case "H2": return `\n## ${childrenContent}\n`;
        case "H3": return `\n### ${childrenContent}\n`;
        case "H4": return `\n#### ${childrenContent}\n`;
        case "H5": return `\n##### ${childrenContent}\n`;
        case "P":
          if (context.inList) return childrenContent;
          return `\n${childrenContent}\n`;
        case "STRONG":
        case "B": return `**${childrenContent}**`;
        case "EM":
        case "I": return `*${childrenContent}*`;
        case "DEL":
        case "S": return `~~${childrenContent}~~`;
        case "CODE":
          if (context.inPre) return childrenContent;
          return `\`${childrenContent}\``;
        case "BLOCKQUOTE":
          return `\n> ${childrenContent.trim().split("\n").join("\n> ")}\n`;
        case "UL":
        case "OL": return `\n${childrenContent}\n`;
        case "LI":
          const parent = node.parentElement;
          let prefix = "- ";
          if (parent && parent.tagName === "OL") {
            const start = parseInt(parent.getAttribute("start")) || 1;
            const index = Array.from(parent.children)
              .filter((el) => el.tagName === "LI")
              .indexOf(node);
            prefix = `${start + index}. `;
          }
          return `${prefix}${childrenContent.trim()}\n`;
        case "A":
          const href = node.getAttribute("href");
          if (!href) return childrenContent;
          return `[${childrenContent}](${href})`;
        case "DETAILS": return `\n<details>\n${childrenContent}\n</details>\n`;
        case "SUMMARY": return `<summary>${childrenContent}</summary>\n`;
        default: return childrenContent;
      }
    }

    let result = traverse(rootElement);
    return result.replace(/\n{3,}/g, "\n\n").trim();
  }

  // === 主程序执行 ===
  const selectors = [".markdown", ".ProseMirror", ".model-response-text", "markdown-viewer"];
  let processedContainers = new WeakSet();

  function scanAndAddButtons() {
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach((container, index) => {
        if (!processedContainers.has(container)) {
          if (!container.querySelector('.gemini-export-float-btn')) {
            createFloatingButton(container, processedContainers.size);
            processedContainers.add(container);
          }
        }
      });
    });
  }

  window.__GEMINI_EXPORT_TIMER__ = setInterval(scanAndAddButtons, 1000);
  scanAndAddButtons();

  function createFloatingButton(container, index) {
    if (container.querySelector('.gemini-export-float-btn')) return;
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') container.style.position = 'relative';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'gemini-button-container';
    Object.assign(buttonContainer.style, {
      position: 'absolute', top: '-34px', right: '16px', zIndex: '1000', display: 'flex', gap: '8px',
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'gemini-copy-float-btn';
    // ... (此处省略了冗长的 SVG 构建代码，保持与原版一致)
    const copySvg = createSvgIcon("copy");
    copyBtn.appendChild(copySvg);
    const copySpan = document.createElement("span");
    copySpan.textContent = "Copy";
    copyBtn.appendChild(copySpan);

    const isDarkMode = document.body.classList.contains('dark-theme');
    const buttonStyles = isDarkMode ? {
      background: 'rgba(30, 30, 30, 0.95)', color: '#e2e8f0', border: '1px solid rgba(255, 255, 255, 0.1)',
    } : {
      background: 'rgba(255, 255, 255, 0.95)', color: '#1e293b', border: '1px solid rgba(226, 232, 240, 0.8)',
    };

    Object.assign(copyBtn.style, {
      padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      display: 'flex', alignItems: 'center', opacity: '0.6', ...buttonStyles,
    });

    copyBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      copyToMarkdown(container, copyBtn);
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'gemini-export-float-btn';
    exportBtn.appendChild(createSvgIcon("export"));
    const span = document.createElement("span");
    span.textContent = "Export";
    exportBtn.appendChild(span);

    Object.assign(exportBtn.style, {
      padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      display: 'flex', alignItems: 'center', opacity: '0.6', ...buttonStyles,
    });

    exportBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      exportToMarkdown(container);
    });

    buttonContainer.appendChild(copyBtn);
    buttonContainer.appendChild(exportBtn);
    container.appendChild(buttonContainer);
  }

  // 辅助函数：创建 SVG
  function createSvgIcon(type) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.5");
    svg.style.marginRight = "6px";
    if (type === "copy") {
        const r1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r1.setAttribute("x", "9"); r1.setAttribute("y", "9"); r1.setAttribute("width", "13"); r1.setAttribute("height", "13"); r1.setAttribute("rx", "2");
        const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p1.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
        svg.appendChild(r1); svg.appendChild(p1);
    } else {
        const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p1.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
        const p2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        p2.setAttribute("points", "7 10 12 15 17 10");
        const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l1.setAttribute("x1", "12"); l1.setAttribute("y1", "15"); l1.setAttribute("x2", "12"); l1.setAttribute("y2", "3");
        svg.appendChild(p1); svg.appendChild(p2); svg.appendChild(l1);
    }
    return svg;
  }

  // 复制为 Markdown。
  async function copyToMarkdown(target, button) {
    const finalMd = htmlToMarkdown(target); // 直接获取转换后的内容

    try {
      await navigator.clipboard.writeText(finalMd);
      const originalText = button.querySelector('span').textContent;
      button.querySelector('span').textContent = "Copied!";
      setTimeout(() => {
        button.querySelector('span').textContent = originalText;
      }, 2000);
    } catch (err) {
      alert("复制失败");
    }
  }

  // 导出为 Markdown。
  function exportToMarkdown(target) {
    const finalMd = htmlToMarkdown(target); // 直接获取转换后的内容

    const blob = new Blob([finalMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `gemini_export_${timestamp}.md`;
    a.click();
    URL.revokeObjectURL(url);

  }
})();
