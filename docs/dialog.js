/*
 * <dialog> shim for WebKit builds older than Safari 15.4, which is what the
 * PS5 browser is on older firmware.
 *
 * There the tag is unknown to the parser, so it becomes an HTMLUnknownElement:
 * display:inline, still in the flow, which turns #pick-dialog into an extra
 * item of the body grid that paints under the catalogue on first load. There
 * is also no showModal(), no open property, no ::backdrop and no top layer.
 *
 * Escape is deliberately not handled here. input.js already captures keydown
 * at the document, calls preventDefault()/stopPropagation() on code 27 and
 * routes CIRCLE to closePickDialog(), so the native cancel is suppressed on
 * new WebKit too and a second handler here would close the dialog twice.
 */
var Dialog = (function () {
    "use strict";

    var NATIVE = typeof HTMLDialogElement === "function" &&
	typeof HTMLDialogElement.prototype.showModal === "function";

    // Set while the head is parsed, so the fallback rules in elfldr.css are in
    // force for the first frame the body paints -- the dialog must never be
    // briefly visible on load.
    if (!NATIVE) {
	document.documentElement.classList.add("no-dialog");
    }

    // Gives the element the slice of the dialog API that elfldr.js uses:
    // .open, .show(), .showModal(), .close() and the close event.
    function polyfill(el) {
	var backdrop = null;

	if (NATIVE || !el || el.showModal) {
	    return el;
	}

	Object.defineProperty(el, "open", {
	    configurable: true,
	    get: function () {
		return el.hasAttribute("open");
	    },
	    set: function (value) {
		if (value) {
		    el.setAttribute("open", "");
		} else {
		    el.removeAttribute("open");
		}
	    }
	});

	el.show = function () {
	    el.setAttribute("open", "");
	};

	el.showModal = function () {
	    if (el.hasAttribute("open")) {
		return;
	    }

	    backdrop = document.createElement("div");
	    backdrop.className = "dialog-backdrop";

	    // A click on the real ::backdrop is reported as a click on the
	    // dialog, which is what the click-outside handler in elfldr.js
	    // looks for. Closing from here reaches the same place without
	    // having to forge an event the handler would have to recognise.
	    backdrop.addEventListener("click", function () {
		el.close();
	    });

	    el.parentNode.insertBefore(backdrop, el);
	    el.setAttribute("open", "");
	};

	el.close = function (value) {
	    if (!el.hasAttribute("open")) {
		return;
	    }

	    el.removeAttribute("open");

	    if (backdrop) {
		backdrop.parentNode.removeChild(backdrop);
		backdrop = null;
	    }
	    if (value !== undefined) {
		el.returnValue = value;
	    }

	    // Native close does not bubble; the listener is on the dialog.
	    el.dispatchEvent(new Event("close"));
	};

	return el;
    }

    return {
	native: NATIVE,
	polyfill: polyfill
    };
})();
