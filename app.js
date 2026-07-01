// =====================================================
// VARIABLES & ÉTATS
// =====================================================
let rules = {};
let currentNode = null;
let historyStack = []; 
const MAX_STEPS = 8; 

const questionDiv = document.getElementById("question");
const helpDiv = document.getElementById("help");
const resultDiv = document.getElementById("result");
const answersDiv = document.getElementById("answers");
const explicationDiv = document.getElementById("explication");
const referenceDiv = document.getElementById("reference");
const citationDiv = document.getElementById("citation");
const examplesDiv = document.getElementById("practical-examples");
const examplesBlock = document.getElementById("examples");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");

// =====================================================
// CHARGEMENT DU JSON
// =====================================================
async function loadRules() {
  try {
    const response = await fetch("rules.json");
    if (!response.ok) throw new Error("Impossible de charger le fichier rules.json");
    rules = await response.json();
    initApp();
  } catch (error) {
    questionDiv.innerHTML = "Erreur de chargement des règles métier.";
    console.error(error);
  }
}

function initApp() {
    historyStack = [];
    currentNode = rules.start;
    resultDiv.className = ""; 
    render();
}

// =====================================================
// FONCTIONS UTILITAIRES
// =====================================================
function createButton(label, className = "") {
  const btn = document.createElement("button");
  btn.textContent = label;
  if (className) btn.className = className;
  return btn;
}

function updateProgress() {
    let percent = Math.min(Math.round((historyStack.length / MAX_STEPS) * 100), 100);
    if (rules[currentNode]?.result) percent = 100; 
    if(progressFill) progressFill.style.width = `${percent}%`;
    if(progressText) progressText.innerText = `${percent}%`;
}

function goBack() {
    if (historyStack.length > 0) {
        currentNode = historyStack.pop();
        render(false);
    }
}

function navigateTo(nextNode) {
    historyStack.push(currentNode);
    currentNode = nextNode;
    render();
}

// =====================================================
// MOTEUR DE RENDU
// =====================================================
function render(isForward = true) {
  const node = rules[currentNode];
  if (!node) return;

  updateProgress();
  answersDiv.innerHTML = "";

  // =======================================
  // 1. GESTION DU RÉSULTAT FINAL ET EXPORTS
  // =======================================
  if (node.result) {
    questionDiv.style.display = "none";
    examplesBlock.style.display = "none";
    answersDiv.style.display = "flex"; 
    resultDiv.style.display = "block";
    resultDiv.innerHTML = node.result;

    // Code couleur PMSI
    if (node.result.includes("NON ÉLIGIBLE")) resultDiv.className = "danger";
    else if (node.result.includes("PARTIELLE")) resultDiv.className = "warning";
    else resultDiv.className = "success";

    // Date du jour pour les exports
    const date = new Date().toLocaleDateString('fr-FR');
    const exportText = `Évaluation PMSI - Éligibilité HDJ du ${date}\nDécision : ${node.result}`;

    // Bouton 1 : Copie DPI
    const copyBtn = createButton("📋 Copier pour le DPI");
    copyBtn.style.background = "#0284c7";
    copyBtn.style.color = "white";
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(exportText).then(() => {
            copyBtn.textContent = "✅ Copié !";
            copyBtn.style.background = "#16a34a";
            setTimeout(() => {
                copyBtn.textContent = "📋 Copier pour le DPI";
                copyBtn.style.background = "#0284c7";
            }, 3000);
        }).catch(err => console.error('Erreur de copie', err));
    };

    // Bouton 2 : Export TXT
    const downloadBtn = createButton("💾 Télécharger (.txt)");
    downloadBtn.style.background = "#0f172a";
    downloadBtn.style.color = "white";
    downloadBtn.onclick = () => {
        const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Evaluation_HDJ_${date.replace(/\//g, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Bouton 3 : Recommencer
    const restartBtn = createButton("🔄 Nouvelle évaluation");
    restartBtn.style.background = "#475569";
    restartBtn.style.color = "white";
    restartBtn.onclick = initApp;

    answersDiv.appendChild(copyBtn);
    answersDiv.appendChild(downloadBtn);
    answersDiv.appendChild(restartBtn);
    return;
  }

  // =======================================
  // 2. GESTION DES QUESTIONS
  // =======================================
  questionDiv.style.display = "block";
  examplesBlock.style.display = "block";
  answersDiv.style.display = "flex";
  resultDiv.style.display = "none";
  questionDiv.textContent = node.text || "";

  if (node.info) {
    explicationDiv.innerHTML = node.info.explication || "";
    referenceDiv.innerHTML = node.info.reference || "";
    citationDiv.innerHTML = node.info.citation || "";
    examplesDiv.innerHTML = "";
    (node.info.exemples || []).forEach(item => {
      examplesDiv.innerHTML += `<li>${item}</li>`;
    });
  }

  if (node.type === "boolean") {
    const yesButton = createButton("✅ Oui");
    yesButton.id = "btn-yes";
    yesButton.onclick = () => navigateTo(node.yes);
    
    const noButton = createButton("❌ Non");
    noButton.id = "btn-no";
    noButton.onclick = () => navigateTo(node.no);

    answersDiv.appendChild(yesButton);
    answersDiv.appendChild(noButton);
  } 
  else if (node.type === "choice") {
    Object.entries(node.choices).forEach(([label, next]) => {
      const btn = createButton(label);
      btn.style.background = "#f1f5f9";
      btn.style.color = "#1e293b";
      btn.style.border = "1px solid #cbd5e1";
      btn.onclick = () => navigateTo(next);
      answersDiv.appendChild(btn);
    });
  } 
  else if (node.type === "multiselect") {
    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";

    node.choices.forEach(choice => {
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = choice;
      const label = document.createElement("label");
      label.style.marginLeft = "10px";
      label.textContent = choice;
      row.appendChild(checkbox);
      row.appendChild(label);
      wrapper.appendChild(row);
    });

    const nextButton = createButton("Suivant ➜");
    nextButton.style.marginTop = "20px";
    nextButton.style.background = "#0066cc";
    nextButton.style.color = "white";
    nextButton.onclick = () => navigateTo(node.next);
    
    wrapper.appendChild(nextButton);
    answersDiv.appendChild(wrapper);
  }

  // Bouton de retour dans l'historique
  if (historyStack.length > 0) {
      const backBtn = createButton("↩ Retour");
      backBtn.style.background = "#e2e8f0";
      backBtn.style.color = "#475569";
      backBtn.style.width = "100%";
      backBtn.style.marginTop = "15px";
      backBtn.onclick = goBack;
      answersDiv.appendChild(backBtn);
  }
}

// Démarrage
window.addEventListener("DOMContentLoaded", loadRules);
