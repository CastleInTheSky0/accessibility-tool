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
        panel.toggleAttribute("data-a11y-hidden", !active);
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
      if (panel) panel.setAttribute("data-a11y-hidden", "");
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

  const registrationDemo = document.getElementById("api-registration-demo");
  if (registrationDemo) {
    const registerAllButton = document.getElementById("js-register-all");
    const disposeRegionsButton = document.getElementById("js-dispose-regions");
    const disposeTabsButton = document.getElementById("js-dispose-tabs");
    const destroyButton = document.getElementById("js-destroy-tool");
    const status = document.getElementById("js-registration-status");
    const regionStatus = document.getElementById("js-region-status");
    const tabStatus = document.getElementById("js-tab-status");
    const eventStatus = document.getElementById("js-event-status");
    const contentElement = registrationDemo.querySelector(
      '[data-js-region="content"]',
    );
    const runtimeTabs = Array.from(
      registrationDemo.querySelectorAll("[data-js-tab]"),
    );
    const runtimePanels = Array.from(
      registrationDemo.querySelectorAll("[data-js-panel]"),
    );
    let regionRegistration = null;
    let tabRegistration = null;
    let hostEventCount = 0;

    const refreshRegistrationStatus = () => {
      const registeredRegionCount = registrationDemo.querySelectorAll(
        "[data-js-region][data-a11y-region]",
      ).length;
      const firstTab = runtimeTabs[0];
      const firstPanel = runtimePanels[0];
      const tablistCount = new Set(
        runtimeTabs.map((tab) => tab.parentElement).filter(Boolean),
      ).size;

      registrationDemo.toggleAttribute(
        "data-regions-registered",
        Boolean(regionRegistration),
      );
      registrationDemo.toggleAttribute(
        "data-tabs-registered",
        Boolean(tabRegistration),
      );
      regionStatus.textContent = regionRegistration
        ? `${registeredRegionCount} 个节点已注册`
        : "等待注册";
      tabStatus.textContent = tabRegistration
        ? `${runtimeTabs.length} 个选项 · ${tablistCount} 组 tablist`
        : "等待注册";
      tabStatus.title = tabRegistration
        ? `${firstTab?.id || ""} → ${firstPanel?.id || ""}`
        : "";
      eventStatus.textContent = `click × ${hostEventCount}`;
      const allRegistered = Boolean(regionRegistration && tabRegistration);
      registerAllButton.disabled = allRegistered;
      registerAllButton.textContent = allRegistered
        ? "已完成全部注册"
        : regionRegistration || tabRegistration
          ? "补全注册"
          : "运行全部注册";
      disposeRegionsButton.disabled = !regionRegistration;
      disposeTabsButton.disabled = !tabRegistration;

      status.classList.remove("is-updating");
      void status.offsetWidth;
      status.classList.add("is-updating");
    };

    const registerRegions = () => {
      if (regionRegistration || !contentElement) {
        return;
      }
      regionRegistration = tool.registerRegions([
        {
          target: '[data-js-region="viewport"]',
          region: 1,
          label: "入口",
        },
        {
          target: '[data-js-region="navigation"]',
          region: 2,
          label: "快捷导航",
        },
        {
          target: '[data-js-region="interaction"]',
          region: 3,
          label: "参数操作",
        },
        {
          target: '[data-js-region="service"]',
          region: 4,
          label: "查询服务",
        },
        {
          target: '[data-js-region="list"]',
          region: 5,
          label: "结果清单",
        },
        { target: contentElement, region: 6, label: "说明正文" },
      ]);
    };

    const registerTabs = () => {
      if (tabRegistration) {
        return;
      }
      tabRegistration = tool.registerTabs([
        {
          tab: ".services-tab-hditem",
          panel: ".services-tabcut-bdcontent",
          region: 1,
        },
      ]);
    };

    const activateRuntimeTab = (tab) => {
      if (!tabRegistration) {
        return;
      }
      const group = tab.closest("[data-js-tab-group]");
      if (!group) {
        return;
      }
      hostEventCount += 1;
      const activeKey = tab.dataset.jsTab;
      const groupTabs = group.querySelectorAll("[data-js-tab]");
      const groupPanels = group.querySelectorAll("[data-js-panel]");
      for (const item of groupTabs) {
        item.setAttribute("aria-selected", String(item === tab));
      }
      for (const panel of groupPanels) {
        const active = panel.dataset.jsPanel === activeKey;
        panel.setAttribute("aria-hidden", String(!active));
        panel.toggleAttribute("data-a11y-hidden", !active);
      }
      refreshRegistrationStatus();
    };

    for (const tab of runtimeTabs) {
      tab.addEventListener("click", () => activateRuntimeTab(tab));
    }

    registerAllButton.addEventListener("click", () => {
      registerRegions();
      registerTabs();
      refreshRegistrationStatus();
    });

    disposeRegionsButton.addEventListener("click", () => {
      regionRegistration?.dispose();
      regionRegistration = null;
      refreshRegistrationStatus();
    });

    disposeTabsButton.addEventListener("click", () => {
      tabRegistration?.dispose();
      tabRegistration = null;
      refreshRegistrationStatus();
    });

    destroyButton.addEventListener("click", async () => {
      destroyButton.disabled = true;
      await tool.destroy();
      regionRegistration = null;
      tabRegistration = null;
      hostEventCount = 0;
      destroyButton.disabled = false;
      refreshRegistrationStatus();
    });

    refreshRegistrationStatus();
  }
})();
