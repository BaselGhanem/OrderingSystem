(() => {
    let dialog;
    let active = false;
    const queue = [];

    function mount() {
        dialog = document.createElement(`dialog`);
        dialog.className = `dad-dialog`;
        dialog.dir = `rtl`;
        dialog.setAttribute(`aria-labelledby`, `dadDialogTitle`);
        dialog.setAttribute(`aria-describedby`, `dadDialogMessage`);
        dialog.innerHTML = `
            <form method="dialog">
                <div class="dad-dialog-icon" aria-hidden="true"></div>
                <h2 id="dadDialogTitle"></h2>
                <p id="dadDialogMessage"></p>
                <textarea aria-label="النص المطلوب" rows="3" maxlength="4000" hidden></textarea>
                <div class="dad-dialog-actions">
                    <button class="dad-dialog-cancel" value="cancel">إلغاء</button>
                    <button class="dad-dialog-primary" value="accept">متابعة</button>
                </div>
            </form>`;
        document.body.append(dialog);
    }

    function showNext() {
        if (active || !queue.length) return;
        if (!dialog) mount();
        active = true;
        const { mode, message, initial, resolve } = queue.shift();
        const destructive = mode !== `alert` && /حذف|نهائي|استبدال|يمسح/.test(message);
        dialog.dataset.tone = destructive ? `danger` : mode === `alert` ? `notice` : `confirm`;
        dialog.querySelector(`.dad-dialog-icon`).textContent = destructive || mode === `alert` ? `!` : `؟`;
        dialog.querySelector(`h2`).textContent = destructive ? `تأكيد الإجراء` : mode === `alert` ? `تنبيه` : mode === `prompt` ? `النص المطلوب` : `تأكيد`;
        dialog.querySelector(`p`).textContent = message;
        const input = dialog.querySelector(`textarea`);
        input.hidden = mode !== `prompt`;
        input.value = mode === `prompt` ? initial : ``;
        const cancel = dialog.querySelector(`.dad-dialog-cancel`);
        cancel.hidden = mode === `alert`;
        const primary = dialog.querySelector(`.dad-dialog-primary`);
        primary.textContent = mode === `alert` ? `تمام` : `متابعة`;

        dialog.returnValue = `cancel`;
        dialog.addEventListener(`close`, () => {
            const accepted = dialog.returnValue === `accept`;
            active = false;
            resolve(mode === `prompt` ? (accepted ? input.value : null) : accepted);
            queueMicrotask(showNext);
        }, { once: true });
        dialog.showModal();
        (mode === `prompt` ? input : mode === `alert` ? primary : cancel).focus();
    }

    function request(mode, message, initial = ``) {
        return new Promise(resolve => {
            queue.push({ mode, message: String(message ?? ``), initial: String(initial ?? ``), resolve });
            showNext();
        });
    }

    window.DadDialog = {
        alert: message => request(`alert`, message),
        confirm: message => request(`confirm`, message),
        prompt: (message, initial) => request(`prompt`, message, initial)
    };
})();
