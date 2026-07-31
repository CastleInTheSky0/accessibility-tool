window.AccessibilityTool.configure({
  debug: new URLSearchParams(location.search).get("debug") === "1",
  regions: { autoDetect: false },
  toolbar: { helpUrl: "/help.html" },
});

const openButton = document.getElementById("open-tool");
openButton.addEventListener("click", () => {
  void window.AccessibilityTool.open({ trigger: openButton });
});
