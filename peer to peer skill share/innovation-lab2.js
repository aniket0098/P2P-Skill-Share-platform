/* =========================================================
   PORTAL. — INNOVATION LAB / 02 IMAGINE
   INTERACTION ENGINE
========================================================= */


/* =========================================================
   NAVBAR
========================================================= */

const navbar = document.getElementById("navbar");

function updateNavbar() {
  if (!navbar) return;

  navbar.classList.toggle(
    "scrolled",
    window.scrollY > 30
  );
}

window.addEventListener(
  "scroll",
  updateNavbar,
  { passive: true }
);

updateNavbar();


/* =========================================================
   CURSOR GLOW
========================================================= */

const cursorGlow =
  document.querySelector(".cursor-glow");

if (
  cursorGlow &&
  window.matchMedia("(pointer:fine)").matches
) {

  window.addEventListener(
    "pointermove",
    (event) => {

      cursorGlow.style.left =
        `${event.clientX}px`;

      cursorGlow.style.top =
        `${event.clientY}px`;

    },
    { passive: true }
  );

}


/* =========================================================
   REVEAL ANIMATIONS
========================================================= */

const revealElements =
  document.querySelectorAll(".reveal");

const revealObserver =
  new IntersectionObserver(
    (entries) => {

      entries.forEach((entry) => {

        if (entry.isIntersecting) {

          entry.target.classList.add("visible");

          revealObserver.unobserve(
            entry.target
          );

        }

      });

    },
    {
      threshold: 0.12
    }
  );

revealElements.forEach((element) => {

  revealObserver.observe(element);

});


/* =========================================================
   MOBILE MENU
========================================================= */

const mobileMenu =
  document.getElementById("mobileMenu");

const navLinks =
  document.querySelector(".nav-links");

if (mobileMenu && navLinks) {

  mobileMenu.addEventListener(
    "click",
    () => {

      navLinks.classList.toggle(
        "mobile-open"
      );

    }
  );

}


/* =========================================================
   IDEA STUDIO
========================================================= */

const methods =
  document.querySelectorAll(".method");

const engineStatus =
  document.getElementById("engineStatus");

const engineWord =
  document.getElementById("engineWord");

const conceptTitle =
  document.getElementById("conceptTitle");

const conceptText =
  document.getElementById("conceptText");


const methodWords = {
  reframe: "SEE",
  combine: "CONNECT",
  remove: "REMOVE",
  flip: "REVERSE",
  scale: "EXPAND",
  future: "IMAGINE"
};


methods.forEach((method) => {

  method.addEventListener(
    "click",
    () => {

      methods.forEach((item) => {
        item.classList.remove("active");
      });

      method.classList.add("active");

      const methodType =
        method.dataset.method;

      const title =
        method.dataset.title;

      const text =
        method.dataset.text;

      if (engineStatus) {

        engineStatus.textContent =
          "GENERATING DIRECTION";

      }

      if (engineWord) {

        engineWord.textContent =
          methodWords[methodType] || "THINK";

      }

      if (conceptTitle) {

        conceptTitle.textContent =
          title;

      }

      if (conceptText) {

        conceptText.textContent =
          text;

      }

      /*
       * Small visual reset.
       */

      const stage =
        document.querySelector(
          ".engine-stage"
        );

      if (stage) {

        stage.animate(
          [
            {
              opacity: .65,
              transform: "scale(.985)"
            },
            {
              opacity: 1,
              transform: "scale(1)"
            }
          ],
          {
            duration: 450,
            easing: "cubic-bezier(.2,.7,.2,1)"
          }
        );

      }

      setTimeout(() => {

        if (engineStatus) {

          engineStatus.textContent =
            "DIRECTION GENERATED";

        }

      }, 450);

    }
  );

});


/* =========================================================
   THINKING SYSTEM
========================================================= */

const selectorItems =
  document.querySelectorAll(".selector-item");

const methodNumber =
  document.getElementById("methodNumber");

const displayNumber =
  document.getElementById("displayNumber");

const displayLabel =
  document.getElementById("displayLabel");

const displayTitle =
  document.getElementById("displayTitle");

const displayText =
  document.getElementById("displayText");

const displaySymbol =
  document.getElementById("displaySymbol");

const methodDisplay =
  document.querySelector(".method-display");


selectorItems.forEach((item) => {

  item.addEventListener(
    "click",
    () => {

      selectorItems.forEach((button) => {

        button.classList.remove("active");

      });

      item.classList.add("active");

      const number =
        item.dataset.number;

      const label =
        item.dataset.label;

      const title =
        item.dataset.title;

      const text =
        item.dataset.text;

      const symbol =
        item.dataset.symbol;

      if (methodNumber)
        methodNumber.textContent =
          number;

      if (displayNumber)
        displayNumber.textContent =
          number;

      if (displayLabel)
        displayLabel.textContent =
          label;

      if (displayTitle)
        displayTitle.textContent =
          title;

      if (displayText)
        displayText.textContent =
          text;

      if (displaySymbol)
        displaySymbol.textContent =
          symbol;


      /*
       * Transition the display.
       */

      if (methodDisplay) {

        methodDisplay.animate(
          [
            {
              opacity: .45,
              transform: "translateY(8px)"
            },
            {
              opacity: 1,
              transform: "translateY(0)"
            }
          ],
          {
            duration: 420,
            easing: "cubic-bezier(.2,.7,.2,1)"
          }
        );

      }

    }
  );

});


/* =========================================================
   CONCEPT BUILDER
========================================================= */

const ingredients =
  document.querySelectorAll(".ingredient");

const finalConcept =
  document.getElementById("finalConcept");

const finalDescription =
  document.getElementById("finalDescription");

const impactValue =
  document.getElementById("impactValue");

const feasibilityValue =
  document.getElementById("feasibilityValue");

const noveltyValue =
  document.getElementById("noveltyValue");


const conceptTemplates = {

  Patients: {
    AI: {
      Predict:
        "Predictive Patient AI",
      Connect:
        "Connected Patient AI",
      Automate:
        "Automated Patient AI",
      Personalize:
        "Personalized Patient AI"
    },

    Robotics: {
      Predict:
        "Predictive Care Robotics",
      Connect:
        "Connected Care Robotics",
      Automate:
        "Autonomous Patient Robotics",
      Personalize:
        "Personalized Care Robotics"
    },

    IoT: {
      Predict:
        "Predictive Patient Network",
      Connect:
        "Connected Patient Network",
      Automate:
        "Automated Patient Network",
      Personalize:
        "Personalized Patient Network"
    },

    "No-code": {
      Predict:
        "No-code Patient Intelligence",
      Connect:
        "No-code Patient Network",
      Automate:
        "No-code Care Automation",
      Personalize:
        "No-code Patient Experience"
    }
  },

  Doctors: {
    AI: {
      Predict: "Predictive Doctor Assistant",
      Connect: "Connected Doctor Intelligence",
      Automate: "Automated Doctor Workflow",
      Personalize: "Personalized Clinical AI"
    },

    Robotics: {
      Predict: "Predictive Clinical Robotics",
      Connect: "Connected Clinical Robotics",
      Automate: "Autonomous Clinical Assistant",
      Personalize: "Personalized Care Robotics"
    },

    IoT: {
      Predict: "Predictive Clinical Network",
      Connect: "Connected Clinical Network",
      Automate: "Automated Clinical Network",
      Personalize: "Personalized Doctor Network"
    },

    "No-code": {
      Predict: "No-code Clinical Intelligence",
      Connect: "No-code Doctor Network",
      Automate: "No-code Clinical Automation",
      Personalize: "No-code Clinical Platform"
    }
  },

  Students: {
    AI: {
      Predict: "Predictive Student AI",
      Connect: "Connected Student Intelligence",
      Automate: "Automated Learning Assistant",
      Personalize: "Personalized Learning AI"
    },

    Robotics: {
      Predict: "Predictive Learning Robotics",
      Connect: "Connected Learning Robotics",
      Automate: "Autonomous Learning Lab",
      Personalize: "Personalized Learning Robotics"
    },

    IoT: {
      Predict: "Predictive Learning Network",
      Connect: "Connected Campus Network",
      Automate: "Automated Learning Network",
      Personalize: "Personalized Learning Environment"
    },

    "No-code": {
      Predict: "No-code Learning Intelligence",
      Connect: "No-code Student Network",
      Automate: "No-code Learning Automation",
      Personalize: "No-code Learning Platform"
    }
  },

  Communities: {
    AI: {
      Predict: "Predictive Community AI",
      Connect: "Connected Community Intelligence",
      Automate: "Automated Community Support",
      Personalize: "Personalized Community AI"
    },

    Robotics: {
      Predict: "Predictive Community Robotics",
      Connect: "Connected Community Robotics",
      Automate: "Autonomous Community Services",
      Personalize: "Personalized Community Robotics"
    },

    IoT: {
      Predict: "Predictive Community Network",
      Connect: "Connected Community Network",
      Automate: "Automated Community Infrastructure",
      Personalize: "Personalized Community Network"
    },

    "No-code": {
      Predict: "No-code Community Intelligence",
      Connect: "No-code Community Network",
      Automate: "No-code Community Automation",
      Personalize: "No-code Community Platform"
    }
  }
};


function getSelectedIngredients() {

  const selected = {};

  ingredients.forEach((ingredient) => {

    if (
      ingredient.classList.contains("active")
    ) {

      selected[
        ingredient.dataset.group
      ] = ingredient.dataset.value;

    }

  });

  return selected;
}


function calculateConceptScore(selected) {

  let impact = 72;
  let feasibility = 68;
  let novelty = 75;

  if (selected.technology === "AI") {

    impact += 10;
    novelty += 7;

  }

  if (selected.technology === "Robotics") {

    impact += 8;
    novelty += 11;

    feasibility -= 8;

  }

  if (selected.technology === "IoT") {

    impact += 6;
    feasibility += 4;

  }

  if (selected.technology === "No-code") {

    feasibility += 10;

  }

  if (selected.behavior === "Predict") {

    impact += 5;

  }

  if (selected.behavior === "Automate") {

    impact += 7;
    feasibility -= 3;

  }

  if (selected.behavior === "Personalize") {

    novelty += 6;

  }

  if (selected.behavior === "Connect") {

    feasibility += 4;

  }

  return {

    impact: Math.min(99, impact),
    feasibility: Math.min(99, Math.max(40, feasibility)),
    novelty: Math.min(99, novelty)

  };

}


function updateConcept() {

  const selected =
    getSelectedIngredients();

  const user =
    selected.user;

  const technology =
    selected.technology;

  const behavior =
    selected.behavior;


  if (
    !user ||
    !technology ||
    !behavior
  ) return;


  let concept =
    `${behavior} ${user} ${technology}`;


  if (
    conceptTemplates[user] &&
    conceptTemplates[user][technology] &&
    conceptTemplates[user][technology][behavior]
  ) {

    concept =
      conceptTemplates[user]
        [technology]
        [behavior];

  }


  const scores =
    calculateConceptScore(selected);


  if (finalConcept) {

    finalConcept.textContent =
      concept;

  }

  if (finalDescription) {

    finalDescription.textContent =
      `${technology}-powered solution that uses ${behavior.toLowerCase()} capabilities to improve experiences for ${user.toLowerCase()}.`;

  }

  if (impactValue) {

    impactValue.textContent =
      scores.impact;

  }

  if (feasibilityValue) {

    feasibilityValue.textContent =
      scores.feasibility;

  }

  if (noveltyValue) {

    noveltyValue.textContent =
      scores.novelty;

  }


  const result =
    document.querySelector(".concept-result");

  if (result) {

    result.animate(
      [
        {
          opacity: .45,
          transform: "translateY(7px)"
        },
        {
          opacity: 1,
          transform: "translateY(0)"
        }
      ],
      {
        duration: 400,
        easing: "ease-out"
      }
    );

  }

}


ingredients.forEach((ingredient) => {

  ingredient.addEventListener(
    "click",
    () => {

      const group =
        ingredient.dataset.group;

      document
        .querySelectorAll(
          `.ingredient[data-group="${group}"]`
        )
        .forEach((item) => {

          item.classList.remove("active");

        });

      ingredient.classList.add("active");

      updateConcept();

    }
  );

});


updateConcept();


/* =========================================================
   IDEA MATRIX
========================================================= */

const matrixDots =
  document.querySelectorAll(".matrix-dot");

const matrixTooltip =
  document.getElementById("matrixTooltip");


matrixDots.forEach((dot) => {

  const label =
    dot.querySelector("span")?.textContent ||
    "Idea";


  dot.addEventListener(
    "mouseenter",
    () => {

      matrixDots.forEach((item) => {

        item.classList.remove("active");

      });

      dot.classList.add("active");

      if (matrixTooltip) {

        matrixTooltip.textContent =
          label;

        matrixTooltip.classList.add(
          "show"
        );

      }

    }
  );


  dot.addEventListener(
    "mouseleave",
    () => {

      dot.classList.remove("active");

      if (matrixTooltip) {

        matrixTooltip.classList.remove(
          "show"
        );

      }

    }
  );


  dot.addEventListener(
    "click",
    () => {

      if (matrixTooltip) {

        matrixTooltip.textContent =
          `${label} selected`;

        matrixTooltip.classList.add(
          "show"
        );

      }

      matrixDots.forEach((item) => {

        item.classList.remove("active");

      });

      dot.classList.add("active");

    }
  );

});


/* =========================================================
   IDEA COUNTER MICRO-ANIMATION
========================================================= */

const ideasGenerated =
  document.getElementById(
    "ideasGenerated"
  );

if (ideasGenerated) {

  let current =
    parseInt(
      ideasGenerated.textContent,
      10
    ) || 0;

  let target =
    current;

  /*
   * Small demo interaction.
   * This can later be replaced with
   * real backend-generated counts.
   */

  ingredients.forEach((ingredient) => {

    ingredient.addEventListener(
      "click",
      () => {

        target++;

        let value =
          current;

        const animation =
          setInterval(() => {

            value++;

            ideasGenerated.textContent =
              value;

            if (value >= target) {

              clearInterval(animation);

              current = value;

            }

          }, 35);

      }
    );

  });

}


/* =========================================================
   SCROLL ACTIVE NAVIGATION
========================================================= */

const pageSections =
  document.querySelectorAll(
    "main section[id]"
  );

const pageLinks =
  document.querySelectorAll(
    ".nav-links a"
  );

function updateActiveNavigation() {

  let current = "top";

  pageSections.forEach((section) => {

    const top =
      section.offsetTop - 180;

    if (
      window.scrollY >= top
    ) {

      current =
        section.id;

    }

  });

  pageLinks.forEach((link) => {

    link.classList.remove("active");

    if (
      link.getAttribute("href") ===
      `#${current}`
    ) {

      link.classList.add("active");

    }

  });

}

window.addEventListener(
  "scroll",
  updateActiveNavigation,
  { passive: true }
);


/* =========================================================
   KEYBOARD ACCESSIBILITY
========================================================= */

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      navLinks
    ) {

      navLinks.classList.remove(
        "mobile-open"
      );

    }

  }
);