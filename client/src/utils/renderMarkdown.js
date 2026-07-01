/**
 * renderMarkdown.js
 * Custom lightweight markdown renderer for JARVIS chat messages
 */

/**
 * Escape HTML special characters
 */
const escapeHtml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Render markdown string to HTML
 */
export const renderMarkdown = (text) => {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (must be before inline code)
  html = html.replace(
    /```(\w+)?\n?([\s\S]*?)```/g,
    (_, lang, code) => {
      const language = lang || 'text';
      return `<div class="code-block">
        <div class="code-header">
          <span class="code-lang">${language}</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText)">Copy</button>
        </div>
        <pre><code class="language-${language}">${code.trim()}</code></pre>
      </div>`;
    }
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr" />');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[*\-•] (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">[\s\S]*?<\/li>)(?!\s*<li)/g, '<ul class="md-ul">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
  html = html.replace(/(<li class="md-oli">[\s\S]*?<\/li>)(?!\s*<li)/g, '<ol class="md-ol">$1</ol>');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
  );

  // Line breaks / paragraphs
  html = html.replace(/\n\n+/g, '</p><p class="md-p">');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped in a block element
  if (!html.startsWith('<')) {
    html = `<p class="md-p">${html}</p>`;
  }

  return html;
};
