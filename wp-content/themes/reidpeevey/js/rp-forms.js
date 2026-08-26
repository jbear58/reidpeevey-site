/*
 * rp-forms.js - Phase 3 lead capture for reidpeevey.com.
 *
 * Handles every form carrying data-rp-form on the page: the contact form, the
 * compact "Looking for space in Waco?" blocks, and the footer newsletter block.
 * No dependencies, no build step.
 *
 * Transport: JSON body sent as Content-Type text/plain. That content type is
 * what keeps the browser from firing a CORS preflight, which an Apps Script web
 * app cannot answer. If fetch is unavailable or throws, the form falls back to a
 * plain POST into a hidden iframe, which always works.
 *
 * Progressive enhancement: every form also carries a real action + method, so
 * with JavaScript off the browser posts straight to the endpoint and the script
 * answers with a plain thank-you page.
 *
 * TOKEN is visible here on purpose. It is a tripwire, not authentication - the
 * spam defense that matters (honeypot, time-to-submit, per-email rate limit) all
 * lives server side. See Tech/Active/website-leads/BRIEF.md in the vault.
 */
(function () {
	'use strict';

	var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwefNTHsscVv5maqtIXBei9P1T9fg7EuUNx2_rt21gJvUSNaofIuNxiCSpd_NTRjvUz/exec';
	var TOKEN = '58c93cef07c041e3e8c33b9e593650ae7647993476dedf6d';

	var OK_TEXT = "Thanks, we'll be in touch within one business day.";
	var ERR_TEXT = 'Something went wrong. Call us at (254) 752-9500 or email Josh@reidpeevey.com.';

	// Page load. The server rejects anything submitted less than 3 seconds after
	// this, which no human ever manages and most bots always do.
	var T0 = Date.now();

	function track(name, params) {
		if (typeof window.gtag === 'function') {
			try { window.gtag('event', name, params || {}); } catch (e) { /* never block a submit */ }
		}
	}

	function statusEl(form) {
		var el = form.querySelector('.rpFormStatus');
		if (!el) {
			el = document.createElement('div');
			el.className = 'rpFormStatus';
			form.appendChild(el);
		}
		return el;
	}

	function say(form, text, isOk) {
		var el = statusEl(form);
		el.textContent = text;
		el.className = 'rpFormStatus isVisible ' + (isOk ? 'isOk' : 'isError');
	}

	function clearSay(form) {
		var el = form.querySelector('.rpFormStatus');
		if (el) { el.textContent = ''; el.className = 'rpFormStatus'; }
	}

	function button(form) { return form.querySelector('button[type="submit"], button'); }

	function payloadFrom(form) {
		var action = form.getAttribute('data-rp-form') === 'subscribe' ? 'subscribe' : 'inquiry';
		var data = {
			token: TOKEN,
			action: action,
			t0: T0,
			page: window.location.href,
			referer: document.referrer || '',
			ua: navigator.userAgent || '',
			agent: form.getAttribute('data-agent') || ''
		};
		var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
		for (var i = 0; i < fields.length; i++) {
			var f = fields[i];
			if (f.type === 'submit' || f.type === 'button') continue;
			data[f.name] = f.value;
		}
		return data;
	}

	/* Last resort: a real form POST into a hidden iframe. Nothing can be read back
	   out of it (cross origin), so the page shows the generic thank-you. */
	function iframeFallback(form, data) {
		var name = 'rpFormSink' + Date.now();
		var frame = document.createElement('iframe');
		frame.name = name;
		frame.style.display = 'none';
		document.body.appendChild(frame);

		var proxy = document.createElement('form');
		proxy.method = 'post';
		proxy.action = ENDPOINT;
		proxy.target = name;
		proxy.style.display = 'none';
		Object.keys(data).forEach(function (k) {
			var input = document.createElement('input');
			input.type = 'hidden';
			input.name = k;
			input.value = data[k] == null ? '' : String(data[k]);
			proxy.appendChild(input);
		});
		document.body.appendChild(proxy);
		proxy.submit();
		return true;
	}

	function onSubmit(ev) {
		var form = ev.currentTarget;
		ev.preventDefault();

		var btn = button(form);
		if (btn && btn.disabled) return;          // double-click guard
		if (btn) { btn.disabled = true; }
		clearSay(form);

		var data = payloadFrom(form);
		// One id per submit attempt. It rides along on BOTH the fetch and the iframe
		// fallback, so if the fallback re-posts a submission the server already
		// saved, the server recognizes it and does not save it twice.
		data.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
		var isSubscribe = data.action === 'subscribe';
		var formId = form.getAttribute('id') || form.getAttribute('data-form') || data.action;

		function succeed() {
			say(form, OK_TEXT, true);
			form.reset();
			if (isSubscribe) {
				track('newsletter_signup', { form_id: formId, page_path: window.location.pathname });
			} else {
				track('form_submit', { form_id: formId, agent: data.agent || 'fallback',
				                       interest: data.interest || '', page_path: window.location.pathname });
			}
			if (btn) { btn.disabled = false; }
		}

		function failWith(message) {
			say(form, message || ERR_TEXT, false);
			if (btn) { btn.disabled = false; }
		}

		if (typeof window.fetch !== 'function') {
			iframeFallback(form, data);
			succeed();
			return;
		}

		window.fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain;charset=utf-8' },
			body: JSON.stringify(data)
		}).then(function (res) {
			// A real HTTP error (a 403 before the script is authorized, a 500 inside
			// it) is NOT a transport problem, so it must not fall through to the
			// iframe path and show a thank-you for a lead that was never saved.
			if (!res.ok) { return { httpError: res.status }; }
			return res.json();
		}).then(function (out) {
			if (out && out.httpError) { failWith(ERR_TEXT); }
			else if (out && out.ok) { succeed(); }
			else { failWith(userMessage(out && out.error)); }
		}).catch(function () {
			// Network, CORS or a parse failure. Post it the old way rather than lose it.
			try {
				iframeFallback(form, data);
				succeed();
			} catch (e) {
				failWith(ERR_TEXT);
			}
		});
	}

	/* Validation messages from the endpoint are written for a visitor to read.
	   The two security-shaped ones are not, so they show the generic line. */
	function userMessage(err) {
		var e = String(err || '');
		if (!e || e === 'unauthorized' || e === 'bad origin' || e === 'unknown action' || e === 'bad request') {
			return ERR_TEXT;
		}
		return e.charAt(0).toUpperCase() + e.slice(1) + '.';
	}

	function init() {
		var forms = document.querySelectorAll('form[data-rp-form]');
		for (var i = 0; i < forms.length; i++) {
			forms[i].setAttribute('action', ENDPOINT);
			forms[i].setAttribute('method', 'post');
			forms[i].addEventListener('submit', onSubmit, false);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, false);
	} else {
		init();
	}
})();
