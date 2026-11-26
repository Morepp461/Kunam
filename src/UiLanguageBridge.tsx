import { useEffect } from "react";
import { translateUiText, type UiLanguage } from "./lib/ui-language";

type Props = { language: UiLanguage; isAboutUs?: boolean };
type TextState = { source: string; translated: string };
const textStates = new WeakMap<Text, TextState>();
const attributeStates = new WeakMap<Element, Map<string, TextState>>();
const attributes = ["placeholder", "aria-label", "title"];

function shouldSkipText(element: Element) {
  return Boolean(element.closest("script,style,code,pre,textarea,input,svg,[contenteditable='true'],[data-no-translate]"));
}
function shouldSkipAttribute(element: Element) {
  return Boolean(element.closest("script,style,code,pre,svg,[contenteditable='true'],[data-no-translate]"));
}
function applyText(node: Text, language: UiLanguage) {
  const parent = node.parentElement;
  if (!parent) return;
  const previous = textStates.get(node);
  const source = previous && node.data === previous.translated ? previous.source : node.data;
  if (shouldSkipText(parent)) {
    if (previous) node.data = source;
    textStates.delete(node);
    return;
  }
  const translated = translateUiText(source, language);
  textStates.set(node, { source, translated });
  if (node.data !== translated) node.data = translated;
}
function applyAttribute(element: Element, name: string, language: UiLanguage) {
  const current = element.getAttribute(name);
  if (current === null) return;
  let states = attributeStates.get(element);
  if (!states) { states = new Map(); attributeStates.set(element, states); }
  const previous = states.get(name);
  const source = previous && current === previous.translated ? previous.source : current;
  if (shouldSkipAttribute(element)) {
    if (previous) element.setAttribute(name, source);
    states.delete(name);
    return;
  }
  const translated = translateUiText(source, language);
  states.set(name, { source, translated });
  if (current !== translated) element.setAttribute(name, translated);
}
function applyNode(node: Node, language: UiLanguage) {
  if (node.nodeType === Node.TEXT_NODE) { applyText(node as Text, language); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  for (const attribute of attributes) applyAttribute(element, attribute, language);
  for (const child of Array.from(element.childNodes)) applyNode(child, language);
}
function restoreNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    const state = textStates.get(text);
    if (state) { text.data = state.source; textStates.delete(text); }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  const states = attributeStates.get(element);
  if (states) { for (const [name, state] of states) element.setAttribute(name, state.source); states.clear(); }
  for (const child of Array.from(element.childNodes)) restoreNode(child);
}
export default function UiLanguageBridge({ language, isAboutUs = false }: Props) {
  useEffect(() => {
    if (!document.body) return;
    document.documentElement.lang = isAboutUs ? "en" : language;
    if (isAboutUs) { restoreNode(document.body); return; }
    applyNode(document.body, language);
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target instanceof Text) applyText(record.target, language);
        else if (record.type === "attributes" && record.target instanceof Element && record.attributeName) applyAttribute(record.target, record.attributeName, language);
        else if (record.type === "childList") record.addedNodes.forEach((node) => applyNode(node, language));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [language, isAboutUs]);
  return null;
}
