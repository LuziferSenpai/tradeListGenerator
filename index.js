const wishlistAtom = atomWithStorage("wishlist", {});
const filterAtom = atomWithStorage("filter", { name: "", rarity: "all" });
const setsAtom = atom([]);

let allSets = [];

function atomWithStorage(key, initialValue) {
    const listeners = new Set();
    let value = JSON.parse(localStorage.getItem(key) ?? 'null') ?? initialValue;

    return {
        get: () => value,
        set: (next) => {
            value = typeof next === 'function' ? next(value) : next;

            localStorage.setItem(key, JSON.stringify(value));
            listeners.forEach(fn => fn(value));
        },
        subscribe: (fn) => {
            listeners.add(fn);

            fn(value);

            return () => listeners.delete(fn);
        }
    };
}

function atom(initialValue) {
    const listeners = new Set();
    let value = initialValue;

    return {
        get: () => value,
        set: (next) => {
            value = typeof next === 'function' ? next(value) : next;

            listeners.forEach(fn => fn(value));
        },
        subscribe: (fn) => {
            listeners.add(fn);

            fn(value);

            return () => listeners.delete(fn);
        }
    };
}

function debounce(fn, delay = 300) {
    let timer;

    return (...args) => {
        clearTimeout(timer);

        timer = setTimeout(() => fn(...args), delay);
    };
}

function showToast(message, type = "alert-success") {
    const toast = document.getElementById("toast");
    const newAlert = document.createElement("div");

    newAlert.classList.add("alert", type, "rounded-2xl");
    newAlert.innerHTML = `<span>${message}</span>`;

    toast.appendChild(newAlert);

    setTimeout(() => newAlert.remove(), 3000);
}

function setRarity(rarity) {
    filterAtom.set(oldFilter => ({ ...oldFilter, rarity }));

    document.activeElement.blur();
}

function clearWishlist() {
    wishlistAtom.set({});

    document.querySelectorAll(".card-display input").forEach(input => input.value = 0);

    showToast("Wishlist cleared!");
}

function importWishlist() { 
    try {
        wishlistAtom.set(JSON.parse(document.getElementById("import-field").value));

        document.querySelectorAll(".card-display").forEach(element => {
            const accordion = element.closest(".set-accordion");
            const setName = accordion?.name;
            const cardIndex = parseInt(element.dataset.cardId, 10);
            const saved = wishlistAtom.get()[setName]?.find(c => c.index === cardIndex);

            element.querySelector("[data-field='want']").value = saved?.want ?? 0;
            element.querySelector("[data-field='have']").value = saved?.have ?? 0;
        });

        showToast("Wishlist imported!");
    } catch {
        showToast("Invalid wishlist file.", "alert-error");
    }
}

function exportWishlist() {
    const json = JSON.stringify(wishlistAtom.get(), null, 4);

    document.getElementById("export-field").value = json;

    navigator.clipboard.writeText(json).then(() => showToast("Copied to clipboard!"));
}

const setNameFilter = debounce(e => filterAtom.set(oldFilter => ({ ...oldFilter, name: e.target.value.toLowerCase() })), 300);

function updateWishlist(set, card, field, value) {
    wishlistAtom.set(wishlist => {
        const setName = `${set.symbol} - ${set.name}`;
        const existingCards = wishlist[setName] ?? [];
        const existingCard = existingCards.find(c => c.index === card.index);
        const updatedCard = existingCard ? { ...existingCard, [field]: value } : { index: card.index, name: card.name, want: 0, have: 0, [field]: value };

        let updatedCards;

        if (updatedCard.want === 0 && updatedCard.have === 0) {
            updatedCards = existingCards.filter(c => c.index !== card.index);
        } else if (existingCard) {
            updatedCards = existingCards.map(c => c.index === card.index ? updatedCard : c);
        } else {
            updatedCards = [...existingCards, updatedCard].sort((a, b) => a.index - b.index);
        }

        if (updatedCards.length === 0) {
            const { [setName]: _removed, ...rest } = wishlist;

            return rest;
        }

        return { ...wishlist, [setName]: updatedCards };
    });
}

function getWishlistCard(set, cardIndex) {
    return wishlistAtom.get()[`${set.symbol} - ${set.name}`]?.find(c => c.index === cardIndex);
}

function renderSets(sets) {
    const wrapper = document.getElementById("sets-accordions");
    const visibleSetNames = new Set(sets.map(set => `${set.symbol} - ${set.name}`));

    wrapper.querySelectorAll(".set-accordion").forEach(accordion => {
        if (!visibleSetNames.has(accordion.name)) accordion.classList.add("hidden!")
    });

    sets.forEach(set => {
        const setName = `${set.symbol} - ${set.name}`;
        let accordion = wrapper.querySelector(`.set-accordion[name="${setName}"]`);

        if (!accordion) {
            accordion = document.createElement("details");
            accordion.classList.add("set-accordion", "collapse", "join-item", "border-base-300", "border");
            accordion.name = setName;
            accordion.innerHTML = `
                <summary class="collapse-title cursor-pointer font-semibold">${setName}</summary>
                <div class="set-accordion-content collapse-content grid w-full h-fit justify-center gap-4"></div>
            `;

            wrapper.appendChild(accordion);
        }

        const content = accordion.querySelector(".set-accordion-content");
        const visibleCardIds = new Set(set.cards.map(c => String(c.index)));

        accordion.classList.toggle("hidden!", visibleCardIds.size === 0);

        content.querySelectorAll(".card-display").forEach(cardDisplay => {
            cardDisplay.classList.toggle("hidden!", !visibleCardIds.has(cardDisplay.dataset.cardId));
        });

        set.cards.forEach(card => {
            if (content.querySelector(`.card-display[data-card-id="${card.index}"]`)) return;

            const saved = getWishlistCard(set, card.index);
            const cardWrapper = document.createElement("div");

            cardWrapper.classList.add("card-display", "flex", "flex-col", "gap-2");
            cardWrapper.dataset.cardId = card.index;
            cardWrapper.innerHTML = `
                <img src="sets/${setName}/${String(card.index).padStart(3, "0")}.png" />
                <div class="flex items-center justify-between px-2">
                    <div class="flex flex-col items-center gap-2">
                        <p class="w-fit text-sm">Want:</p>
                        <input class="input input-neutral join-item rounded-xl" data-field="want" type="number" value="${saved?.want ?? 0}" min="0" />
                    </div>
                    <div class="flex flex-col items-center gap-2">
                        <p class="w-fit text-sm">Have:</p>
                        <input class="input input-neutral join-item rounded-xl" data-field="have" type="number" value="${saved?.have ?? 0}" min="0" />
                    </div>
                </div>
            `;

            cardWrapper.querySelectorAll("input").forEach(input => {
                input.addEventListener("change", e => {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);

                    e.target.value = val;

                    updateWishlist(set, card, e.target.dataset.field, val);
                });
            });

            content.appendChild(cardWrapper);
        });
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const rarityDisplay = document.getElementById("rarity-display");
    const [setsJSON, tradeableJSON] = await Promise.all([
        fetch("./sets.json").then(res => res.json()),
        fetch("./currentlyTradeable.json").then(res => res.json())
    ]);

    document.getElementById("name-filter").value = filterAtom.get().name;

    allSets = setsJSON.map(set => set.cards ? { ...set, cards: set.cards.filter(card => tradeableJSON.includes(card.rarity)) } : set);

    setsAtom.subscribe(sets => renderSets(sets));
    setsAtom.set(allSets);

    filterAtom.subscribe(({ name, rarity }) => {
        if (rarity === "all") rarityDisplay.innerHTML = "All";
        else rarityDisplay.innerHTML = `<img src="./rarities/${rarity}.png" class="h-3 object-contain">`;

        setsAtom.set(allSets.map(set => set.cards ? { ...set, cards: set.cards.filter(card => card.name.toLowerCase().includes(name) && (rarity === "all" || card.rarity === rarity)) } : set));
    })
});