/*
 * rp-track.js - Phase 3 GA4 event tracking for reidpeevey.com.
 *
 * Fires gtag events directly. No tag manager: every change to this site is a git
 * commit anyway, so a GTM container would only add a second script load, a
 * publish step and an owner. If a marketer ever needs GTM, swapping the loader
 * is a one-file change.
 *
 * Events:
 *   tel_click     - any tel: link
 *   pdf_download  - any .pdf link on OUR pages (today: the two TREC notices in
 *                   the footer). Listing flyers live inside the Buildout iframe,
 *                   which is cross-origin: clicks in there never reach this
 *                   document, so they cannot be tracked from here. Phase 5's
 *                   own listing pages will carry flyer links this CAN see.
 * form_submit and newsletter_signup are fired by rp-forms.js instead, where the
 * endpoint's answer is known - a click listener here would count attempts, not
 * leads.
 *
 * One delegated bubbling listener on document. Nothing here may ever block or
 * swallow a navigation.
 */
(function () {
	'use strict';

	function track(name, params) {
		if (typeof window.gtag === 'function') {
			try { window.gtag('event', name, params || {}); } catch (e) { /* never block a click */ }
		}
	}

	function closestLink(node) {
		while (node && node !== document) {
			if (node.tagName && node.tagName.toLowerCase() === 'a') return node;
			node = node.parentNode;
		}
		return null;
	}

	function fileName(href) {
		var clean = String(href).split('?')[0].split('#')[0];
		var parts = clean.split('/');
		return parts[parts.length - 1] || clean;
	}

	function onClick(ev) {
		var a = closestLink(ev.target);
		if (!a) return;
		var href = a.getAttribute('href') || '';
		var path = window.location.pathname;

		if (href.toLowerCase().indexOf('tel:') === 0) {
			track('tel_click', { number: href.slice(4), page_path: path });
			return;
		}
		if (/\.pdf(\?|#|$)/i.test(href)) {
			track('pdf_download', { file: fileName(href), link_url: href, page_path: path });
		}
	}

	function init() {
		document.addEventListener('click', onClick, false);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, false);
	} else {
		init();
	}
})();
