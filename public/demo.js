(() => {
  const tool = window.AccessibilityTool;
  const params = new URLSearchParams(window.location.search);

  tool.configure({
    debug: params.get("debug") === "1",
    toolbar: { helpUrl: "/help.html" },
    regions: {
      selectors: { service: "[data-demo-service]" },
    },
    tabs: {
      dialogSelectors: [".demo-floating-panel"],
    },
    colorExclusions: [".brand-swatch"],
  });

  document.querySelectorAll("[data-open-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      void tool.open({ trigger: button });
    });
  });

  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });

  document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
    const activate = (tab) => {
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      tabs.forEach((item) => {
        const panel = document.getElementById(item.getAttribute("aria-controls"));
        if (!panel) return;
        const active = item === tab;
        if (panel instanceof HTMLDialogElement) {
          if (active && !panel.open) panel.showModal();
          return;
        }
        panel.hidden = !active;
      });
    };

    tablist.addEventListener("click", (event) => {
      const tab = event.target.closest?.('[role="tab"]');
      if (tab && tablist.contains(tab)) activate(tab);
    });
    tablist.addEventListener("mouseover", (event) => {
      const tab = event.target.closest?.('[role="tab"]');
      if (tab && tablist.contains(tab)) activate(tab);
    });
  });

  document.querySelectorAll("[data-a11y-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      if (dialog) {
        dialog.close();
        return;
      }
      const panel = button.closest(".demo-floating-panel");
      if (panel) panel.hidden = true;
    });
  });

  const dynamicRoot = document.getElementById("dynamic-regions");
  let dynamicIndex = 0;
  const latestRegion = () => dynamicRoot.lastElementChild;

  document.getElementById("add-region").addEventListener("click", () => {
    dynamicIndex += 1;
    const section = document.createElement("section");
    section.dataset.a11yRegion = "service";
    section.dataset.a11yLabel = `动态服务 ${dynamicIndex}`;
    section.tabIndex = -1;
    section.innerHTML = `<strong>动态服务 ${dynamicIndex}</strong><p>MutationObserver 会合并更新区域数量。</p>`;
    dynamicRoot.append(section);
  });

  document.getElementById("toggle-region").addEventListener("click", () => {
    const region = latestRegion();
    if (region) region.hidden = !region.hidden;
  });

  document.getElementById("remove-region").addEventListener("click", () => {
    latestRegion()?.remove();
  });

  document.getElementById("route-change").addEventListener("click", () => {
    const route = `/demo/route-${Date.now().toString().slice(-4)}`;
    history.pushState({ route }, "", route);
    document.getElementById("route-outlet").innerHTML =
      `<p>当前路由：<strong>${route}</strong></p><p>路由变化会停止当前朗读、重置分类位置并重新扫描。</p>`;
  });

  const shadowHost = document.getElementById("shadow-demo");
  const shadow = shadowHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>:host{display:block;padding:20px;font:16px/1.5 system-ui;color:#171717}nav{border-left:6px solid #ed5a24;padding-left:16px}a{color:#173fca}</style>
    <nav data-a11y-region="navigation" data-a11y-label="Shadow 导航">
      <strong>开放式 Shadow Root 导航</strong><br>
      <a href="#regions">返回区域协议</a>
    </nav>`;
})();
