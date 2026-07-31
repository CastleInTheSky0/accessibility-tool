window.AccessibilityTool.configure({
  debug: new URLSearchParams(location.search).get("debug") === "1",
  toolbar: { helpUrl: "/help.html" },
});

const openButton = document.getElementById("open-tool");
openButton.addEventListener("click", () => {
  void window.AccessibilityTool.open({ trigger: openButton });
});
