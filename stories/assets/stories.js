(function () {
  function track(name, props) {
    try {
      var payload = props || {};
      if (typeof window.datafast === "function") {
        window.datafast(name, payload);
      }
    } catch (err) { /* ignore */ }
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    var page = document.body.getAttribute("data-page");
    if (page === "library") {
      track("stories_library_view");
    }
    var storyId = document.body.getAttribute("data-story-id");
    if (storyId) {
      track("stories_article_view", {
        story_id: storyId,
        slug: document.body.getAttribute("data-story-slug") || "",
        situation: document.body.getAttribute("data-situation") || ""
      });
    }

    var filters = document.getElementById("situation-filters");
    var grid = document.getElementById("story-grid");
    var empty = document.getElementById("filter-empty");
    if (filters && grid) {
      filters.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-filter]");
        if (!btn) return;
        var value = btn.getAttribute("data-filter") || "all";
        filters.querySelectorAll("[data-filter]").forEach(function (el) {
          el.setAttribute("aria-pressed", el === btn ? "true" : "false");
        });
        var shown = 0;
        grid.querySelectorAll("[data-situation]").forEach(function (card) {
          var match = value === "all" || card.getAttribute("data-situation") === value;
          card.hidden = !match;
          if (match) shown += 1;
        });
        if (empty) empty.hidden = shown > 0;
        track("stories_filter_change", { situation: value });
      });
    }

    document.addEventListener("click", function (e) {
      var goal = e.target.closest("[data-fast-goal]");
      if (!goal) return;
      var name = goal.getAttribute("data-fast-goal");
      if (!name) return;
      track(name, {
        story_id: goal.getAttribute("data-story") || storyId || "",
        slug: document.body.getAttribute("data-story-slug") || ""
      });
    });

    var wrap = document.querySelector(".reddit-embed-wrap");
    if (wrap) {
      var fallback = wrap.querySelector(".embed-fallback");
      var marked = false;
      function succeed() {
        if (marked) return;
        marked = true;
        wrap.setAttribute("data-embed-status", "ok");
        track("stories_embed_visible", { story_id: storyId || "" });
      }
      function fail() {
        if (marked) return;
        marked = true;
        wrap.setAttribute("data-embed-status", "failed");
        if (fallback) fallback.hidden = false;
        track("stories_embed_failed", { story_id: storyId || "" });
      }
      var observer = new MutationObserver(function () {
        if (wrap.querySelector("iframe")) succeed();
      });
      observer.observe(wrap, { childList: true, subtree: true });
      window.setTimeout(function () {
        if (wrap.querySelector("iframe")) succeed();
        else fail();
      }, 8000);
    }

    if (storyId) {
      var flags = { p25: false, p50: false, p75: false, p90: false };
      window.addEventListener("scroll", function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        var pct = window.scrollY / max;
        if (pct >= 0.25 && !flags.p25) { flags.p25 = true; track("stories_scroll_25", { story_id: storyId }); }
        if (pct >= 0.5 && !flags.p50) { flags.p50 = true; track("stories_scroll_50", { story_id: storyId }); }
        if (pct >= 0.75 && !flags.p75) { flags.p75 = true; track("stories_scroll_75", { story_id: storyId }); }
        if (pct >= 0.9 && !flags.p90) { flags.p90 = true; track("stories_scroll_90", { story_id: storyId }); }
      }, { passive: true });
    }
  });
})();
