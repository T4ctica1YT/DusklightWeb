/*
 * coi-serviceworker.js
 *
 * Makes SharedArrayBuffer / crossOriginIsolated available even when the
 * server hosting this page doesn't (or can't) send the
 * Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers itself.
 *
 * It works by registering a Service Worker that rewrites the response
 * headers of every same-origin request. The very first time it runs, the
 * page reloads once so the new navigation request gets intercepted by the
 * (now-active) worker and comes back cross-origin isolated.
 *
 * Requires a secure context (https:// or http://localhost).
 * If the page is already cross-origin isolated (e.g. a server that already
 * sends the right headers), this script does nothing.
 */
(function () {
  "use strict";

  // ---- Service worker context -------------------------------------------
  if (typeof window === "undefined") {
    self.addEventListener("install", function () {
      self.skipWaiting();
    });

    self.addEventListener("activate", function (event) {
      event.waitUntil(self.clients.claim());
    });

    self.addEventListener("fetch", function (event) {
      var req = event.request;

      // Requests made with only-if-cached from a different origin can't be
      // fulfilled and would throw if we touched them.
      if (req.cache === "only-if-cached" && req.mode !== "same-origin") {
        return;
      }

      event.respondWith(
        fetch(req)
          .then(function (response) {
            // Opaque / network-error responses can't have their headers read
            // or modified; pass them through untouched.
            if (response.status === 0) {
              return response;
            }

            var headers = new Headers(response.headers);
            headers.set("Cross-Origin-Opener-Policy", "same-origin");
            headers.set("Cross-Origin-Embedder-Policy", "require-corp");
            headers.set("Cross-Origin-Resource-Policy", "cross-origin");

            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers
            });
          })
          .catch(function (err) {
            console.error("coi-serviceworker: fetch failed", err);
          })
      );
    });

    return;
  }

  // ---- Page context -------------------------------------------------------
  if (window.crossOriginIsolated) {
    // Already isolated (either the server sends the headers itself, or a
    // previous registration of this worker already did its job).
    return;
  }

  if (!window.isSecureContext) {
    console.warn("coi-serviceworker: a secure context (https:// or localhost) is required; skipping.");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    console.warn("coi-serviceworker: Service Workers are not supported in this browser; skipping.");
    return;
  }

  var RELOAD_FLAG = "coiServiceWorkerReloaded";

  // Set synchronously (this script runs first, before the rest of the page)
  // so other inline scripts can tell "isolation isn't ready yet, but a fix
  // is already in progress" apart from "isolation isn't ready and never
  // will be" — and show a friendlier message instead of a hard error.
  window.__coiFixing = true;

  // Called whenever we determine isolation can't be (or wasn't) achieved.
  // Clears the "fixing in progress" flag and fires an event so the page
  // can stop waiting and show its own diagnostic instead of hanging on a
  // "Preparing this page…" state forever.
  function giveUp(reason) {
    window.__coiFixing = false;
    console.warn("coi-serviceworker: " + reason);
    window.dispatchEvent(new CustomEvent("coi-fix-failed", { detail: { reason: reason } }));
  }

  navigator.serviceWorker
    .register(document.currentScript.src)
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      // Reload exactly once so the next navigation request is intercepted
      // by the now-active worker. If we're still not isolated after that
      // (some unusual environment), don't loop forever.
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
        sessionStorage.removeItem(RELOAD_FLAG);
        giveUp("still not cross-origin isolated after reload; giving up.");
        return;
      }
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    })
    .catch(function (err) {
      giveUp("registration failed: " + err);
    });
})();
