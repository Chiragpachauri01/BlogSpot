"use client";

import React from "react";
import ContactCTA from "./ContactCTA";

const COMPONENT_MAP = {
  ContactCTA: ContactCTA,
};

const COMPONENT_RE =
  /<div[^>]+data-component="([A-Za-z][A-Za-z0-9]*)"[^>]*(?:\/>|>[\s\S]*?<\/div>)/gi;

function tokenize(html) {
  const tokens = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(COMPONENT_RE.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const [fullMatch, name] = match;
    const start = match.index;
    if (start > lastIndex) tokens.push({ type: "html", value: html.slice(lastIndex, start) });
    tokens.push({ type: "component", value: name });
    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < html.length) tokens.push({ type: "html", value: html.slice(lastIndex) });
  return tokens;
}

export default function BlogContentRenderer({ html = "", className = "" }) {
  if (!html) return null;

  const tokens = tokenize(html);
  return (
    <div className={`blog-content ${className}`}>
      {tokens.map((token, i) => {
        if (token.type === "html") {
          return <div key={i} dangerouslySetInnerHTML={{ __html: token.value }} />;
        }
        const Component = COMPONENT_MAP[token.value];
        if (!Component) return null;
        return <Component key={i} />;
      })}
    </div>
  );
}
