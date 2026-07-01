let rules = {};
let currentQuestion = "Q1";

const questionDiv = document.getElementById("question");
const helpDiv = document.getElementById("help");
const resultDiv = document.getElementById("result");

const btnYes = document.getElementById("btn-yes");
const btnNo = document.getElementById("btn-no");

const examplesYes = document.getElementById("examples-yes");
const examplesNo = document.getElementById("examples-no");

async function loadRules() {

    const response = await fetch("rules.json");
    rules = await response.json();

    render();
}

function render() {

    const node = rules[currentQuestion];

    if (!node) {
        questionDiv.innerHTML =
            "Erreur : question introuvable.";
        return;
    }

    questionDiv.textContent = node.text || "";

    helpDiv.textContent = node.help || "";

    examplesYes.innerHTML = "";
    examplesNo.innerHTML = "";

    (node.examples_yes || []).forEach(item => {
        examplesYes.innerHTML += `<li>${item}</li>`;
    });

    (node.examples_no || []).forEach(item => {
        examplesNo.innerHTML += `<li>${item}</li>`;
    });

}

btnYes.addEventListener("click", () => {

    alert(
        "Votre fichier rules.json ne contient pas encore les chemins de navigation."
    );

});

btnNo.addEventListener("click", () => {

    alert(
        "Votre fichier rules.json ne contient pas encore les chemins de navigation."
    );

});

loadRules();
