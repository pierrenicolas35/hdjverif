// =====================================================
// VARIABLES
// =====================================================

let tree = {};
let currentNode = null;

const questionDiv = document.getElementById("question");
const helpDiv = document.getElementById("help");
const resultDiv = document.getElementById("result");

const examplesYesDiv = document.getElementById("examples-yes");
const examplesNoDiv = document.getElementById("examples-no");

const answersDiv = document.getElementById("answers");
const progressBar = document.getElementById("progress");

// =====================================================
// CHARGEMENT DU JSON
// =====================================================

async function loadRules() {

    try {

        const response = await fetch("rules.json");

        if (!response.ok) {
            throw new Error("Impossible de charger rules.json");
        }

        tree = await response.json();

        currentNode = tree.start;

        render();

    } catch (error) {

        console.error(error);

        questionDiv.innerHTML =
            "Erreur lors du chargement des règles.";

    }
}

// =====================================================
// AFFICHAGE
// =====================================================

function render() {

    const node = tree[currentNode];

    if (!node) {
        questionDiv.innerHTML =
            "Erreur : nœud introuvable.";
        return;
    }

    // =================================================
    // RESULTAT FINAL
    // =================================================

    if (node.result) {

        questionDiv.style.display = "none";

        const help = document.getElementById("help");
        const examples = document.getElementById("examples");

        if (help) help.style.display = "none";
        if (examples) examples.style.display = "none";

        answersDiv.style.display = "none";

        resultDiv.style.display = "block";
        resultDiv.innerHTML = `<strong>${node.result}</strong>`;

        return;
    }

    // =================================================
    // QUESTION
    // =================================================

    questionDiv.style.display = "block";

    resultDiv.style.display = "none";

    document.getElementById("help").style.display =
        "block";

    document.getElementById("examples").style.display =
        "block";

    answersDiv.style.display = "flex";

    questionDiv.textContent = node.text || "";

    helpDiv.textContent = node.help || "";

    // =================================================
    // EXEMPLES
    // =================================================

    examplesYesDiv.innerHTML = "";

    (node.examples_yes || []).forEach(item => {

        examplesYesDiv.innerHTML +=
            `<li>${item}</li>`;

    });

    examplesNoDiv.innerHTML = "";

    (node.examples_no || []).forEach(item => {

        examplesNoDiv.innerHTML +=
            `<li>${item}</li>`;

    });

    // =================================================
    // REPONSES
    // =================================================

    answersDiv.innerHTML = "";

    // ---------------------------------------------
    // BOOLEAN
    // ---------------------------------------------

    if (node.type === "boolean") {

        const yesBtn =
            createButton("✅ Oui");

        const noBtn =
            createButton("❌ Non");

        yesBtn.onclick = () => {

            currentNode = node.yes;
            render();

        };

        noBtn.onclick = () => {

            currentNode = node.no;
            render();

        };

        answersDiv.appendChild(yesBtn);
        answersDiv.appendChild(noBtn);

    }

    // ---------------------------------------------
    // CHOICE
    // ---------------------------------------------

    else if (node.type === "choice") {

        Object.entries(node.choices)
            .forEach(([label, nextNode]) => {

                const btn =
                    createButton(label);

                btn.onclick = () => {

                    currentNode = nextNode;

                    render();

                };

                answersDiv.appendChild(btn);

            });

    }

    // ---------------------------------------------
    // MULTISELECT
    // ---------------------------------------------

    else if (node.type === "multiselect") {

        const form =
            document.createElement("div");

        form.style.width = "100%";

        const selected = [];

        node.choices.forEach(choice => {

            const container =
                document.createElement("div");

            container.style.marginBottom =
                "10px";

            const checkbox =
                document.createElement("input");

            checkbox.type = "checkbox";

            checkbox.value = choice;

            checkbox.addEventListener(
                "change",
                () => {

                    if (checkbox.checked) {

                        selected.push(choice);

                    } else {

                        const index =
                            selected.indexOf(
                                choice
                            );

                        if (index > -1) {

                            selected.splice(
                                index,
                                1
                            );

                        }

                    }

                }
            );

            const label =
                document.createElement("label");

            label.style.marginLeft = "8px";

            label.textContent = choice;

            container.appendChild(checkbox);
            container.appendChild(label);

            form.appendChild(container);

        });

        const nextBtn =
            createButton("➡️ Suivant");

        nextBtn.style.marginTop = "15px";

        nextBtn.onclick = () => {

            currentNode = node.next;

            render();

        };

        form.appendChild(nextBtn);

        answersDiv.appendChild(form);

    }

}

// =====================================================
// BOUTON
// =====================================================

function createButton(text) {

    const btn =
        document.createElement("button");

    btn.innerHTML = text;

    btn.classList.add("dynamic-btn");

    return btn;
}

// =====================================================
// DEMARRAGE
// =====================================================

loadRules();
