// app.js
const tree = {
  Q1: {
    text: "La prise en charge dure-t-elle moins d'une journée ?",
    yes: "Q2",
    no: "R_NO_DAY"
  },
  Q2: {
    text: "La prise en charge correspond-elle à des séances ?",
    yes: "R_ELIGIBLE",
    no: "Q3"
  },
  Q3: {
    text: "Le patient est-il admis dans une structure d'hospitalisation à temps partiel conforme ?",
    yes: "R_ELIGIBLE",
    no: "R_NOT_ELIGIBLE"
  },
  R_ELIGIBLE: { result: "Éligible à une facturation en hôpital de jour (sous réserve de codage GHM/GHS correct)." },
  R_NOT_ELIGIBLE: { result: "Non éligible à une facturation en hôpital de jour." },
  R_NO_DAY: { result: "Séjour ≥ 1 journée : pas une hospitalisation de jour." }
};

let current = "Q1";

const questionDiv = document.getElementById("question");
const resultDiv = document.getElementById("result");
const btnYes = document.getElementById("btn-yes");
const btnNo = document.getElementById("btn-no");

function render() {
  const node = tree[current];
  if (node.result) {
    questionDiv.textContent = "";
    btnYes.style.display = "none";
    btnNo.style.display = "none";
    resultDiv.textContent = node.result;
  } else {
    questionDiv.textContent = node.text;
    resultDiv.textContent = "";
    btnYes.style.display = "inline-block";
    btnNo.style.display = "inline-block";
  }
}

btnYes.onclick = () => {
  const node = tree[current];
  current = node.yes;
  render();
};

btnNo.onclick = () => {
  const node = tree[current];
  current = node.no;
  render();
};

render();
