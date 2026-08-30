
const ELFLDR_URL = "http://localhost:9021";
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
let TERMINAL = undefined;
let CONTRIBUTORS_OF = undefined;

// The catalogue is the only thing the D-pad browses; the picker takes over
// while it is open. Circle behaves differently in each, so the handler has to
// know which one has the cursor. PICK_RETURN is the card to drop back onto
// once the dialog closes, whichever way it was dismissed.
let PICK_OPEN = false;
let PICK_RETURN = null;


function toast(msg) {
    const toasts = document.getElementById("toast-list");
    const el = document.createElement("p");

    el.textContent = msg;
    toasts.appendChild(el);

    setTimeout(function() {
	el.remove();
    }, 5000);
}


function renderContributors(payload) {
    const contrib = document.getElementById("details-contrib");

    // renderDescription() runs for every chunk of stdout, no need to
    // rebuild (and refetch) the avatars while a payload is running.
    if(CONTRIBUTORS_OF === payload) {
	return;
    }
    CONTRIBUTORS_OF = payload;

    while(contrib.firstChild) {
	contrib.removeChild(contrib.firstChild);
    }

    for(const login of payload.contributors) {
	const item = document.createElement("span");
	const avatar = document.createElement("img");
	const name = document.createElement("span");

	avatar.src = "https://github.com/" + encodeURIComponent(login) + ".png?size=64";
	avatar.alt = "";
	avatar.loading = "lazy";
	avatar.addEventListener('error', function() {
	    avatar.src = BLANK_IMAGE;
	}, {once: true});

	name.textContent = login;

	item.className = "contributor";
	item.title = login;
	item.appendChild(avatar);
	item.appendChild(name);
	contrib.appendChild(item);
    }
}


function renderDescription(payload) {
    const details = document.getElementById("details");
    const name = document.getElementById("details-name");
    const desc = document.getElementById("details-desc");
    const src = document.getElementById("details-src");

    name.textContent = payload.displayname;
    desc.textContent = payload.description;
    src.textContent = payload.sourcecode;
    renderContributors(payload);
    details.hidden = false;

    if(TERMINAL) {
	TERMINAL.clear();
	TERMINAL.write(payload.stdout);
    }
}


function deployPayload(uri, args) {
    const params = new URLSearchParams({
	uri: uri + '?pipe=0&args=' + encodeURI(args)
    });

    const el = document.getElementById("mixed-content-workaround");
    el.src = ELFLDR_URL + '?' + params;

    return undefined;
}


async function deployPipedPayload(uri, args) {
    const params = new URLSearchParams({
	uri: uri + '?args=' + encodeURI(args)
    });

    try {
	const res = await fetch(ELFLDR_URL + '?' + params);
        if(res.ok) {
	    return res;
	}
	throw new Error(res.statusText);
    } catch(err) {
	if(window.location.protocol != "http:") {
	    // Browsers brevent most mixed http and https content,
	    // e.g., fetch("http://...") from a https site, so we
	    // cannot read stdout from payloads.
	    return deployPayload(uri, args);
	}

	toast(payload.displayname + ": " + err.message);
	return undefined;
    }
}


async function launchPipedPayload(payload, reltag) {
    try {
	payload.stdout = "";

	const res = await deployPipedPayload(payload.releases[reltag],
					     payload.args || "");
	if(res == undefined) {
	    return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();

	while(true) {
	    const { done, value } = await reader.read();
	    if (done) {
		break;
	    }
	    payload.stdout += decoder.decode(value);
	    renderDescription(payload);
	}
    } catch(err) {
    }
}


function closePickDialog() {
    const dialog = document.getElementById("pick-dialog");
    if(dialog.open) {
	dialog.close();
    }
}


// Launch whichever release the cursor is on. The button already carries the
// click handler that closes the dialog and deploys, so Cross just re-uses it.
function activatePick() {
    const el = Input.current(document.getElementById("pick-list"));
    if(el) {
	el.click();
    }
}


function renderPickDialog(payload) {
    const dialog = document.getElementById("pick-dialog");
    const list = document.getElementById("pick-list");
    const title = document.getElementById("pick-title");

    // Remember where to send the cursor back to; focusing a release button
    // below takes the ring off the card.
    PICK_RETURN = Input.current(document.getElementById("catalogue"));

    title.textContent = payload.displayname;
    list.replaceChildren();

    for(const tag of Object.keys(payload.releases)) {
	const item = document.createElement("button");
	item.textContent = tag;
	item.className = "focusable";
	item.tabIndex = list.childElementCount + 1;
	item.addEventListener('mouseover', function() {
	    Input.focus(item);
	});
	item.addEventListener('click', function() {
	    dialog.close();
	    launchPipedPayload(payload, tag);
	});
	list.appendChild(item);
    }

    PICK_OPEN = true;
    dialog.showModal();
    Input.focusFirst(list);
}


async function addPayload(payload) {
    const catalogue = document.getElementById("catalogue");
    const card = document.createElement("div");
    const name = document.createElement("h1");
    const desc = document.createElement("p");

    card.className = "card focusable";
    card.tabIndex = catalogue.childElementCount + 1;
    card.payload = payload;
    name.textContent = payload.displayname;
    desc.textContent = payload.description;

    payload.stdout = "";

    card.addEventListener('mouseover', function() {
	// The picker owns the cursor while it is up; don't let a stray
	// mouseover on the catalogue behind it steal focus.
	if(!PICK_OPEN) {
	    Input.focus(card);
	}
    });

    card.addEventListener('click', async function() {
	renderPickDialog(payload);
    });

    card.appendChild(name);
    card.appendChild(desc);
    catalogue.appendChild(card);
}


// One place decides what every button does, split by whichever surface holds
// the cursor -- the catalogue or the release picker -- exactly like svtplay's
// browse/player split.
function handleKey(code) {
    const K = Input.KEY;

    if(PICK_OPEN) {
	const list = document.getElementById("pick-list");
	switch(code) {
	case K.UP:     Input.move("up", list); break;
	case K.DOWN:   Input.move("down", list); break;
	case K.LEFT:   Input.move("left", list); break;
	case K.RIGHT:  Input.move("right", list); break;
	case K.CROSS:  activatePick(); break;
	case K.CIRCLE: closePickDialog(); break;
	default: break;
	}
	return;
    }

    const catalogue = document.getElementById("catalogue");
    switch(code) {
    case K.UP:    Input.move("up", catalogue); break;
    case K.DOWN:  Input.move("down", catalogue); break;
    case K.LEFT:  Input.move("left", catalogue); break;
    case K.RIGHT: Input.move("right", catalogue); break;
    case K.CROSS: {
	const el = Input.current(catalogue);
	if(el && el.payload) {
	    renderPickDialog(el.payload);
	}
	break;
    }
    default: break;
    }
}


function initInput() {
    const dialog = document.getElementById("pick-dialog");

    // Whatever the cursor lands on in the catalogue is what the details pane
    // describes, so focus and "show details" are the same event.
    Input.setFocusListener(function(el) {
	if(el && el.payload) {
	    renderDescription(el.payload);
	}
    });

    Input.setHandler(handleKey);

    // Click-outside, Escape and a launched release all end up here; put the
    // cursor back on the card that opened the dialog and hand control back to
    // the catalogue.
    dialog.addEventListener('close', function() {
	PICK_OPEN = false;
	if(PICK_RETURN) {
	    Input.focus(PICK_RETURN);
	}
    });
}


async function init() {
    const dialog = document.getElementById("pick-dialog");
    dialog.addEventListener('click', function(e) {
	if(e.target === dialog) {
	    dialog.close();
	}
    });

    initInput();

    try {
        const res = await fetch("payloads.json");
        if(!res.ok) {
	    throw new Error(res.statusText);
	}
        const payloads = (await res.json()) || [];
	payloads.forEach(addPayload);
    } catch (err) {
        toast("payloads.json: " + err.message);
    }

    // Land the cursor on the first payload so the D-pad works from the start,
    // which also fills the details pane through the focus listener.
    Input.focusFirst(document.getElementById("catalogue"));

    const stdout = document.getElementById('details-stdout');
    TERMINAL = new Terminal({
	convertEol: true,
	altClickMovesCursor: false,
	disableStdin: true,
	fontSize: 16,
	cols: 90,
	rows: 12
    });

    TERMINAL.open(stdout);
}
