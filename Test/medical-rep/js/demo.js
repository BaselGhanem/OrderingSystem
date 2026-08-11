(() => {
    const $ = selector => document.querySelector(selector);
    const $$ = selector => Array.from(document.querySelectorAll(selector));
    const completionKey = `dad_medrep_demo_completed_v1`;

    const roleData = {
        rep: {
            label: `Medical Rep Demo`,
            promise: `هذا المسار يوضح كيف ترى مبيعاتك بوضوح بدون الرجوع لأي شخص.`,
            startUrl: `index.html?role=rep`,
            loginIcon: `ph ph-stethoscope`,
            loginTitle: `Medical Rep`,
            loginText: `ادخل الرقم الوظيفي وتاريخ الميلاد، ثم انتقل إلى لوحة مبيعاتك.`,
            beforeAfter: `بدل ما تسأل عن مبيعاتك، شوفها مباشرة.`,
            mockTitle: `لوحة مبيعات الدعاية الطبية`,
            mockSubtitle: `لوحة الأداء والتحليل`,
            identityLabel: `المندوب الطبي`,
            identityValue: `أحمد خالد`,
            identityMeta: `Team Matador`,
            valueLabel: `قيمة المبيعات`,
            valueMetric: `48,320`,
            qtyLabel: `الكمية`,
            qtyMetric: `1,246`,
            totalCardLabel: `إجمالي القيمة`,
            totalCardValue: `48,320 د.أ`,
            avgCardText: `متوسط السعر: 38.78`,
            qtyCardValue: `1,246`,
            linesCardText: `186 سطر`,
            pharmacyCardLabel: `صيدليات فعالة`,
            pharmacyCardValue: `42`,
            otherCardLabel: `اخرين محتسبة`,
            otherCardValue: `3,780 د.أ`,
            otherCardText: `7.8%`,
            phoneRoleLabel: `مبيعاتك`,
            phoneValue: `48,320`,
            filters: [
                [`من تاريخ`, `01/06/2026`],
                [`إلى تاريخ`, `24/06/2026`],
                [`الصنف`, `كل الأصناف`],
                [`المنطقة`, `كل المناطق`],
                [`نوع الاحتساب`, `الكل`],
                [`بحث سريع`, `صيدلية، كود، صنف...`, true]
            ],
            chart: [
                [`Amman West`, `18,450 د.أ`, 100],
                [`Irbid`, `11,280 د.أ`, 61],
                [`Zarqa`, `8,720 د.أ`, 47],
                [`اخرين`, `3,780 د.أ`, 20]
            ],
            itemsHead: `<tr><th>الصنف</th><th>الكمية</th><th>مباشر</th><th>اخرين</th><th>الإجمالي</th><th>% اخرين</th></tr>`,
            items: [
                [`Cardio Plus 20mg`, `320`, `11,800`, `840`, `12,640`, `6.6%`],
                [`Derma Soft Gel`, `280`, `8,900`, `410`, `9,310`, `4.4%`],
                [`Respira 10`, `190`, `6,420`, `520`, `6,940`, `7.5%`]
            ],
            activityTitle: `آخر الطلبيات / النشاط`,
            activityNote: `تقرأ الحركة الأخيرة بسرعة بدون سؤال يدوي.`,
            activity: [
                [`صيدلية الشفاء`, `Cardio Plus — 36 كمية — اليوم`],
                [`صيدلية القدس`, `Respira 10 — 24 كمية — أمس`],
                [`صيدلية الحياة`, `Derma Soft Gel — 18 كمية — ضمن الفلتر الحالي`]
            ],
            visibility: [
                [`ph ph-eye`, `تشاهد مبيعاتك الشخصية حسب التاريخ والصنف والمنطقة والصيدلية.`],
                [`ph ph-eye-slash`, `لا تظهر لك بيانات مندوبي الفريق الآخرين أو إعدادات الإدارة.`],
                [`ph ph-bell-simple`, `آخر النشاط يساعدك تتابع الأداء بدون انتظار تقارير يدوية.`]
            ],
            finalTitle: `صار عندك وضوح يومي على مبيعاتك.`,
            finalCards: [
                [`ph ph-chart-line-up`, `رؤية مباشرة`, `أرقامك الأساسية تظهر فوراً.`],
                [`ph ph-funnel`, `فلترة عملية`, `تصل للصنف أو الصيدلية بسرعة.`],
                [`ph ph-device-mobile`, `جاهز للموبايل`, `نفس المتابعة على أي شاشة.`]
            ],
            steps: [
                {
                    target: `login`,
                    title: `دخول واضح وبسيط`,
                    body: `المندوب يدخل من مسار Medical Rep باستخدام الرقم الوظيفي وتاريخ الميلاد. لا توجد خطوات معقدة قبل الوصول للوحة.`,
                    bullets: [`دخول سريع`, `مناسب للاستخدام اليومي`, `لا يغيّر الديمو أي بيانات فعلية`]
                },
                {
                    target: `kpis`,
                    title: `مبيعاتك من مكان واحد`,
                    body: `أول ما تفتح اللوحة تشاهد قيمة المبيعات، الكمية، وآخر تحديث. الفكرة الأساسية: الأرقام المهمة أمامك مباشرة.`,
                    bullets: [`قيمة محتسبة`, `كمية محتسبة`, `هوية المندوب والفريق`]
                },
                {
                    target: `filters`,
                    title: `فلترة بدون تعقيد`,
                    body: `استخدم التاريخ والصنف والمنطقة والبحث السريع للوصول للبيانات التي تريدها خلال ثوانٍ.`,
                    bullets: [`تاريخ`, `صنف`, `منطقة`, `بحث بالصيدلية أو الكود`]
                },
                {
                    target: `cards`,
                    title: `KPI Cards تقرأ الصورة بسرعة`,
                    body: `كل بطاقة تلخص جانباً مهماً: القيمة، الكمية، الصيدليات، ومساهمة اخرين عند توفرها.`,
                    bullets: [`أرقام مختصرة`, `مقاييس عملية`, `مناسبة للمتابعة السريعة`]
                },
                {
                    target: `items`,
                    title: `تحليل الأصناف`,
                    body: `هنا تراجع كل صنف بقيمته وكميته، وتفهم أي صنف يتحرك أكثر ضمن مبيعاتك.`,
                    bullets: [`كمية الصنف`, `قيمة الصنف`, `نسبة اخرين إن وجدت`]
                },
                {
                    target: `areaChart`,
                    title: `قراءة المبيعات حسب المنطقة`,
                    body: `الرسم يساعدك تفهم أين تأتي المبيعات الأقوى، وأي منطقة تحتاج متابعة إضافية.`,
                    bullets: [`ترتيب بصري`, `أعلى المناطق أولاً`, `قرار أسرع من الجدول الخام`]
                },
                {
                    target: `activity`,
                    title: `آخر الطلبيات والنشاط`,
                    body: `النشاط الأخير يعطيك إحساساً بحركة السوق بدون الرجوع لملفات Excel أو سؤال أحد عن آخر تحديث.`,
                    bullets: [`صيدلية`, `صنف`, `كمية`, `توقيت الحركة`]
                },
                {
                    target: `privacy`,
                    title: `وضوح بحدود صلاحيتك`,
                    body: `المندوب يرى ما يساعده في المتابعة فقط. البيانات غير المطلوبة أو الخاصة بالأدوار الأخرى تبقى مخفية.`,
                    bullets: [`مبيعاتك الشخصية`, `لا يوجد كشف غير لازم`, `واجهة مركزة على الأداء`]
                },
                {
                    target: `mobile`,
                    title: `جاهز للموبايل`,
                    body: `التصميم يحافظ على وضوح الأرقام والفلاتر على شاشة صغيرة، مع أزرار لمس واضحة وتنقل سريع.`,
                    bullets: [`360px`, `390px`, `430px`, `Tablet وLaptop`]
                },
                {
                    target: `final`,
                    title: `ابدأ المتابعة بثقة`,
                    body: `الديمو يوضح كيف تتحول المبيعات من معلومات متفرقة إلى لوحة سهلة وواضحة للمندوب.`,
                    bullets: [`Visibility`, `Filters`, `Performance follow-up`]
                }
            ]
        },
        team: {
            label: `Team Leader Demo`,
            promise: `هذا المسار يوضح كيف تتابع الفريق وتقرأ الحركة بدون Excel يدوي.`,
            startUrl: `index.html?role=team`,
            loginIcon: `ph ph-users-three`,
            loginTitle: `Team Leader`,
            loginText: `ادخل اسم الفريق وكلمة المرور للوصول إلى لوحة الفريق.`,
            beforeAfter: `بدل ملفات Excel متعددة، شاهد حركة الفريق في لوحة واحدة.`,
            mockTitle: `Team Leader Dashboard`,
            mockSubtitle: `لوحة مبيعات الفريق`,
            identityLabel: `الفريق`,
            identityValue: `Team Matador`,
            identityMeta: `آخر تحديث: اليوم`,
            valueLabel: `قيمة الفريق`,
            valueMetric: `184,760`,
            qtyLabel: `كمية الفريق`,
            qtyMetric: `5,842`,
            totalCardLabel: `إجمالي قيمة الفريق`,
            totalCardValue: `184,760 د.أ`,
            avgCardText: `متوسط السعر: 31.62`,
            qtyCardValue: `5,842`,
            linesCardText: `742 سطر`,
            pharmacyCardLabel: `صيدليات الفريق`,
            pharmacyCardValue: `168`,
            otherCardLabel: `مساهمة اخرين`,
            otherCardValue: `14,860 د.أ`,
            otherCardText: `8.0%`,
            phoneRoleLabel: `قيمة الفريق`,
            phoneValue: `184,760`,
            filters: [
                [`الفريق`, `Team Matador`],
                [`المندوب`, `كل المندوبين`],
                [`من تاريخ`, `01/06/2026`],
                [`إلى تاريخ`, `24/06/2026`],
                [`الصنف`, `كل الأصناف`],
                [`المنطقة`, `كل المناطق`],
                [`بحث`, `مندوب، صيدلية، صنف...`, true]
            ],
            chart: [
                [`Amman West`, `62,400 د.أ`, 100],
                [`Irbid`, `44,950 د.أ`, 72],
                [`Zarqa`, `31,700 د.أ`, 51],
                [`South`, `18,600 د.أ`, 30]
            ],
            itemsHead: `<tr><th>الصنف</th><th>الكمية</th><th>القيمة</th><th>اخرين</th><th>مندوبون</th></tr>`,
            items: [
                [`Cardio Plus 20mg`, `1,180`, `42,600`, `2,120`, `6`],
                [`Derma Soft Gel`, `940`, `31,350`, `1,740`, `5`],
                [`Respira 10`, `720`, `24,820`, `980`, `7`]
            ],
            activityTitle: `أداء المندوبين داخل الفريق`,
            activityNote: `مقارنة سريعة لتحديد نقاط القوة وفرص المتابعة.`,
            activity: [
                [`أحمد خالد`, `48,320 د.أ — أفضل نمو هذا الأسبوع`],
                [`سارة محمود`, `42,900 د.أ — أداء ثابت`],
                [`محمد علي`, `31,740 د.أ — يحتاج متابعة منطقة Zarqa`]
            ],
            visibility: [
                [`ph ph-users-three`, `تشاهد أداء الفريق حسب المندوب والصيدلية والمنطقة والصنف.`],
                [`ph ph-funnel`, `الفلاتر تساعدك تنتقل من ملخص الفريق إلى تفاصيل محددة بسرعة.`],
                [`ph ph-chart-line-up`, `اللوحة تقلل الرجوع إلى Excel وتسرّع قرارات المتابعة.`]
            ],
            finalTitle: `صار عندك تحكم ووضوح أسرع على أداء الفريق.`,
            finalCards: [
                [`ph ph-users-three`, `مقارنة الفريق`, `تعرف الأقوى والأضعف بسرعة.`],
                [`ph ph-map-trifold`, `قراءة المناطق`, `تحدد أين تحتاج متابعة.`],
                [`ph ph-lightning`, `قرارات أسرع`, `أقل وقت في التجميع وأكثر في التحليل.`]
            ],
            steps: [
                {
                    target: `login`,
                    title: `دخول Team Leader`,
                    body: `قائد الفريق يدخل باسم الفريق وكلمة المرور، ثم ينتقل مباشرة إلى لوحة الفريق.`,
                    bullets: [`مسار مستقل`, `صلاحية للفريق`, `جاهز للمتابعة اليومية`]
                },
                {
                    target: `kpis`,
                    title: `ملخص الفريق فوراً`,
                    body: `أول شاشة تعرض قيمة الفريق، الكمية، وآخر تحديث حتى تبدأ من الصورة الكلية قبل التفاصيل.`,
                    bullets: [`قيمة الفريق`, `كمية الفريق`, `آخر تحديث`]
                },
                {
                    target: `filters`,
                    title: `فلاتر إدارية عملية`,
                    body: `تستطيع الوصول بسرعة حسب المندوب، الصيدلية، المنطقة، الصنف، والتاريخ بدون تجهيز Excel يدوي.`,
                    bullets: [`مندوب`, `صيدلية`, `منطقة`, `صنف`, `تاريخ`]
                },
                {
                    target: `cards`,
                    title: `KPIs تساعدك تقرأ الفريق`,
                    body: `البطاقات تلخص حجم المبيعات، عدد الصيدليات، كمية الفريق، ومساهمة اخرين لتفهم الحركة خلال ثوانٍ.`,
                    bullets: [`Summary`, `Volume`, `Coverage`, `Contribution`]
                },
                {
                    target: `activity`,
                    title: `مقارنة أداء المندوبين`,
                    body: `استخدم جدول الأداء لتعرف من يتحرك بقوة، ومن يحتاج متابعة أو دعم حسب البيانات.`,
                    bullets: [`أداء كل مندوب`, `قيمة وكمية`, `فرص متابعة أسرع`]
                },
                {
                    target: `areaChart`,
                    title: `تحديد المناطق القوية والضعيفة`,
                    body: `الرسم يوضح أين تتركز المبيعات، وأين تحتاج الخطة الميدانية إلى انتباه أكبر.`,
                    bullets: [`مناطق قوية`, `مناطق ضعيفة`, `حركة الفريق حسب السوق`]
                },
                {
                    target: `items`,
                    title: `أصناف الفريق`,
                    body: `راجع الأصناف التابعة للفريق بقيمتها وكميتها وعدد المندوبين المرتبطين بها.`,
                    bullets: [`الصنف`, `القيمة`, `الكمية`, `مندوبون مرتبطون`]
                },
                {
                    target: `privacy`,
                    title: `لوحة متابعة لا لوحة إدارة`,
                    body: `قائد الفريق يرى ما يلزمه للمتابعة والتحليل. أدوات الإدارة أو التعديل غير مرتبطة بهذا الديمو.`,
                    bullets: [`Follow-up`, `Analysis`, `No admin changes`]
                },
                {
                    target: `mobile`,
                    title: `واضحة على الموبايل واللابتوب`,
                    body: `الديمو يوضح أن اللوحة تبقى قابلة للقراءة والمتابعة على الهاتف والتابلت واللابتوب.`,
                    bullets: [`Mobile-first`, `Touch-friendly`, `No horizontal overflow`]
                },
                {
                    target: `final`,
                    title: `ابدأ قيادة الفريق بوضوح`,
                    body: `الفكرة النهائية: تحكم أوضح، متابعة أسرع، وقرارات مبنية على أرقام منظمة.`,
                    bullets: [`Control`, `Clarity`, `Faster decisions`]
                }
            ]
        }
    };

    let currentRole = null;
    let currentStepIndex = 0;

    const els = {
        welcome: $(`#welcomeScreen`),
        experience: $(`#demoExperience`),
        roleLabel: $(`#demoRoleLabel`),
        promise: $(`#demoPromiseText`),
        progressFill: $(`#demoProgressFill`),
        stepCounter: $(`#demoStepCounter`),
        title: $(`#stepTitle`),
        body: $(`#stepBody`),
        bullets: $(`#stepBullets`),
        dots: $(`#demoDots`),
        prev: $(`#prevStepBtn`),
        next: $(`#nextStepBtn`),
        skip: $(`#skipDemoBtn`),
        restart: $(`#restartDemoBtn`),
        topRestart: $(`#topRestartBtn`),
        spotlight: $(`#demoSpotlight`),
        pointer: $(`#demoPointer`),
        startUsing: $(`#startUsingLink`)
    };

    function escapeHtml(value = ``) {
        return String(value ?? ``)
            .replace(/&/g, `&amp;`)
            .replace(/</g, `&lt;`)
            .replace(/>/g, `&gt;`)
            .replace(/"/g, `&quot;`)
            .replace(/'/g, `&#039;`);
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function setClass(id, value) {
        const element = document.getElementById(id);
        if (element) element.className = value;
    }

    function renderFilters(filters = []) {
        const container = $(`#mockFilters`);
        if (!container) return;
        container.innerHTML = filters.map(([label, value, wide]) => `
            <div class="field-group ${wide ? `wide` : ``}">
                <label>${escapeHtml(label)}</label>
                <div class="${wide ? `input-control` : `select-control`} demo-static-control">${escapeHtml(value)}</div>
            </div>
        `).join(``);
    }

    function renderChart(rows = []) {
        const container = $(`#demoAreaChart`);
        if (!container) return;
        container.innerHTML = rows.map((row, index) => {
            const [label, value, width] = row;
            return `
                <div class="chart-row">
                    <span class="chart-rank">${index + 1}</span>
                    <div class="chart-main">
                        <div class="chart-label"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>
                        <div class="chart-track"><div class="chart-fill" style="width:${Math.max(8, Number(width) || 0)}%"></div></div>
                    </div>
                    <strong class="chart-value">${escapeHtml(value)}</strong>
                </div>
            `;
        }).join(``);
    }

    function renderItems(data) {
        const head = $(`#itemsHead`);
        const body = $(`#itemsBody`);
        if (head) head.innerHTML = data.itemsHead;
        if (body) {
            body.innerHTML = data.items.map(row => `
                <tr>${row.map((cell, index) => `<td class="${index === 0 ? `item-name` : ``}">${escapeHtml(cell)}</td>`).join(``)}</tr>
            `).join(``);
        }
    }

    function renderActivity(data) {
        const list = $(`#activityList`);
        if (!list) return;
        list.innerHTML = data.activity.map(([title, text]) => `
            <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>
        `).join(``);
    }

    function renderVisibility(data) {
        const list = $(`#visibilityList`);
        if (!list) return;
        list.innerHTML = data.visibility.map(([icon, text]) => `
            <div><i class="${escapeHtml(icon)}"></i><span>${escapeHtml(text)}</span></div>
        `).join(``);
    }

    function renderFinalCards(data) {
        const list = $(`#finalCards`);
        if (!list) return;
        list.innerHTML = data.finalCards.map(([icon, title, text]) => `
            <div><i class="${escapeHtml(icon)}"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>
        `).join(``);
    }

    function renderRole(role) {
        const data = roleData[role];
        if (!data) return;

        setClass(`demoLoginIcon`, data.loginIcon);
        setText(`demoLoginTitle`, data.loginTitle);
        setText(`demoLoginText`, data.loginText);
        setText(`demoBeforeAfter`, data.beforeAfter);
        setText(`mockTitle`, data.mockTitle);
        setText(`mockSubtitle`, data.mockSubtitle);
        setText(`identityLabel`, data.identityLabel);
        setText(`identityValue`, data.identityValue);
        setText(`identityMeta`, data.identityMeta);
        setText(`valueLabel`, data.valueLabel);
        setText(`valueMetric`, data.valueMetric);
        setText(`qtyLabel`, data.qtyLabel);
        setText(`qtyMetric`, data.qtyMetric);
        setText(`totalCardLabel`, data.totalCardLabel);
        setText(`totalCardValue`, data.totalCardValue);
        setText(`avgCardText`, data.avgCardText);
        setText(`qtyCardValue`, data.qtyCardValue);
        setText(`linesCardText`, data.linesCardText);
        setText(`pharmacyCardLabel`, data.pharmacyCardLabel);
        setText(`pharmacyCardValue`, data.pharmacyCardValue);
        setText(`otherCardLabel`, data.otherCardLabel);
        setText(`otherCardValue`, data.otherCardValue);
        setText(`otherCardText`, data.otherCardText);
        setText(`phoneRoleLabel`, data.phoneRoleLabel);
        setText(`phoneValue`, data.phoneValue);
        setText(`activityTitle`, data.activityTitle);
        setText(`activityNote`, data.activityNote);
        setText(`finalTitle`, data.finalTitle);
        if (els.startUsing) els.startUsing.href = data.startUrl;
        if (els.roleLabel) els.roleLabel.textContent = data.label;
        if (els.promise) els.promise.textContent = data.promise;

        renderFilters(data.filters);
        renderChart(data.chart);
        renderItems(data);
        renderActivity(data);
        renderVisibility(data);
        renderFinalCards(data);
        renderDots(data.steps.length);
    }

    function renderDots(count) {
        if (!els.dots) return;
        els.dots.innerHTML = Array.from({ length: count }, (_, index) => `
            <button class="demo-dot" type="button" data-goto-step="${index}" aria-label="الخطوة ${index + 1}"></button>
        `).join(``);
        $$(`[data-goto-step]`).forEach(button => {
            button.addEventListener(`click`, () => goToStep(Number(button.dataset.gotoStep) || 0));
        });
    }

    function getActiveStep() {
        const data = roleData[currentRole];
        return data?.steps?.[currentStepIndex] || null;
    }

    function getTarget(step) {
        if (!step?.target) return $(`#demoScreen`);
        return document.querySelector(`[data-demo-target="${step.target}"]`) || $(`#demoScreen`);
    }

    function clearActiveTargets() {
        $$(`.demo-active-target`).forEach(element => element.classList.remove(`demo-active-target`));
    }

    function updateSpotlight(target) {
        if (!target || !els.spotlight || !els.pointer) return;
        if (window.matchMedia(`(max-width: 620px)`).matches) return;

        const rect = target.getBoundingClientRect();
        const padding = 8;
        const top = Math.max(10, rect.top - padding);
        const left = Math.max(10, rect.left - padding);
        const width = Math.min(window.innerWidth - left - 10, rect.width + padding * 2);
        const height = Math.min(window.innerHeight - top - 10, rect.height + padding * 2);

        Object.assign(els.spotlight.style, {
            opacity: `1`,
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate3d(0,0,0)`
        });

        const pointerLeft = Math.min(window.innerWidth - 54, left + Math.max(24, width * 0.18));
        const pointerTop = Math.min(window.innerHeight - 54, top + Math.max(24, height * 0.18));
        Object.assign(els.pointer.style, {
            opacity: `1`,
            left: `${pointerLeft}px`,
            top: `${pointerTop}px`,
            transform: `translate3d(0,0,0) scale(1)`
        });
    }

    function hideSpotlight() {
        if (els.spotlight) els.spotlight.style.opacity = `0`;
        if (els.pointer) els.pointer.style.opacity = `0`;
    }

    function renderStep() {
        const data = roleData[currentRole];
        const step = getActiveStep();
        if (!data || !step) return;

        const total = data.steps.length;
        if (els.title) els.title.textContent = step.title;
        if (els.body) els.body.textContent = step.body;
        if (els.bullets) {
            els.bullets.innerHTML = (step.bullets || []).map(item => `
                <div><i class="ph ph-check-circle"></i><span>${escapeHtml(item)}</span></div>
            `).join(``);
        }
        if (els.stepCounter) els.stepCounter.textContent = `${currentStepIndex + 1} / ${total}`;
        if (els.progressFill) els.progressFill.style.width = `${((currentStepIndex + 1) / total) * 100}%`;
        if (els.prev) els.prev.disabled = currentStepIndex === 0;
        if (els.next) els.next.innerHTML = currentStepIndex === total - 1 ? `إنهاء <i class="ph ph-check"></i>` : `التالي <i class="ph ph-caret-left"></i>`;

        $$(`.demo-dot`).forEach((dot, index) => dot.classList.toggle(`active`, index === currentStepIndex));
        clearActiveTargets();
        const target = getTarget(step);
        target?.classList.add(`demo-active-target`);
        target?.scrollIntoView({ behavior: `smooth`, block: `center`, inline: `nearest` });
        window.setTimeout(() => updateSpotlight(target), 360);
    }

    function goToStep(index) {
        const data = roleData[currentRole];
        if (!data) return;
        currentStepIndex = Math.max(0, Math.min(index, data.steps.length - 1));
        renderStep();
    }

    function startDemo(role) {
        if (!roleData[role]) return;
        currentRole = role;
        currentStepIndex = 0;
        renderRole(role);
        if (els.welcome) els.welcome.hidden = true;
        if (els.experience) els.experience.hidden = false;
        window.scrollTo({ top: 0, behavior: `smooth` });
        window.setTimeout(renderStep, 120);
    }

    function resetToWelcome() {
        clearActiveTargets();
        hideSpotlight();
        currentStepIndex = 0;
        if (els.experience) els.experience.hidden = true;
        if (els.welcome) els.welcome.hidden = false;
        window.scrollTo({ top: 0, behavior: `smooth` });
    }

    function nextStep() {
        const data = roleData[currentRole];
        if (!data) return;
        if (currentStepIndex >= data.steps.length - 1) {
            localStorage.setItem(completionKey, JSON.stringify({ role: currentRole, completedAt: Date.now() }));
            hideSpotlight();
            window.medrepCommon?.showToast?.(`تم إنهاء الديمو. يمكنك الآن البدء باستخدام النظام.`, `success`);
            $(`#startUsingLink`)?.focus({ preventScroll: true });
            return;
        }
        goToStep(currentStepIndex + 1);
    }

    function previousStep() {
        goToStep(currentStepIndex - 1);
    }

    function bindEvents() {
        $$(`[data-start-role]`).forEach(button => {
            button.addEventListener(`click`, () => startDemo(button.dataset.startRole));
        });
        els.next?.addEventListener(`click`, nextStep);
        els.prev?.addEventListener(`click`, previousStep);
        els.skip?.addEventListener(`click`, resetToWelcome);
        els.restart?.addEventListener(`click`, () => goToStep(0));
        els.topRestart?.addEventListener(`click`, () => {
            if (currentRole) {
                if (els.welcome && !els.welcome.hidden) return;
                goToStep(0);
            } else {
                resetToWelcome();
            }
        });
        window.addEventListener(`resize`, () => {
            const step = getActiveStep();
            const target = getTarget(step);
            updateSpotlight(target);
        });
        window.addEventListener(`scroll`, () => {
            const step = getActiveStep();
            const target = getTarget(step);
            updateSpotlight(target);
        }, { passive: true });
        document.addEventListener(`keydown`, event => {
            if (els.experience?.hidden) return;
            if (event.key === `ArrowLeft`) nextStep();
            if (event.key === `ArrowRight`) previousStep();
            if (event.key === `Escape`) resetToWelcome();
        });
    }

    bindEvents();
})();
