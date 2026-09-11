/* =========================================
   INNOVATION LAB
   INTERACTION SCRIPT
========================================= */


/* ================= NAVBAR ================= */

const navbar = document.getElementById("navbar");

window.addEventListener("scroll", () => {

  if (window.scrollY > 30) {

    navbar.classList.add("scrolled");

  } else {

    navbar.classList.remove("scrolled");

  }

});


/* ================= CURSOR GLOW ================= */

const cursorGlow =
  document.getElementById("cursorGlow");


if (
  cursorGlow &&
  window.matchMedia("(pointer:fine)").matches
) {

  window.addEventListener("pointermove", (event) => {

    cursorGlow.style.left =
      event.clientX + "px";

    cursorGlow.style.top =
      event.clientY + "px";

  });

}


/* ================= REVEAL ================= */

const revealObserver =
  new IntersectionObserver(

    (entries) => {

      entries.forEach((entry) => {

        if (entry.isIntersecting) {

          entry.target.classList.add("visible");

        }

      });

    },

    {
      threshold: 0.12
    }

  );


document
  .querySelectorAll(".reveal")
  .forEach((element) => {

    revealObserver.observe(element);

  });


/* ================= LAB LOOP ================= */

const loopNodes =
  document.querySelectorAll(".loop-node");

const loopDescription =
  document.getElementById("loopDescription");


loopNodes.forEach((node) => {

  node.addEventListener("click", () => {

    loopNodes.forEach((item) => {

      item.classList.remove("selected");

    });


    node.classList.add("selected");


    const step =
      node.dataset.step;

    const title =
      node.dataset.title;

    const text =
      node.dataset.text;


    loopDescription.querySelector("span")
      .textContent = step;


    loopDescription.querySelector("h3")
      .textContent = title;


    loopDescription.querySelector("p")
      .textContent = text;

  });

});


/* ================= LIVE ACTIVITY ================= */

const activityFeed =
  document.getElementById("activityFeed");

const activityNumber =
  document.getElementById("activityNumber");


const activities = [

  {
    type: "INDUSTRY",
    text:
      "Logistics partner opened a new optimization problem."
  },

  {
    type: "STUDENT",
    text:
      "Team Nova uploaded Experiment #219."
  },

  {
    type: "MENTOR",
    text:
      "A robotics mentor joined a student team."
  },

  {
    type: "FACULTY",
    text:
      "New research evidence was attached to Problem #88."
  },

  {
    type: "TEAM",
    text:
      "Prototype v3 moved to industry validation."
  }

];


let activityIndex = 0;


setInterval(() => {

  if (!activityFeed) return;


  const activity =
    activities[
      activityIndex % activities.length
    ];


  const article =
    document.createElement("article");


  article.innerHTML = `

    <span>↗</span>

    <div>

      <small>
        ${activity.type} · NOW
      </small>

      <p>
        ${activity.text}
      </p>

    </div>

  `;


  activityFeed.prepend(article);


  if (activityFeed.children.length > 6) {

    activityFeed.lastElementChild.remove();

  }


  if (activityNumber) {

    activityNumber.textContent =
      17 + (activityIndex % 8);

  }


  activityIndex++;

}, 4200);


/* ================= LAB PARALLAX ================= */

const labEnvironment =
  document.querySelector(".lab-environment");


if (
  labEnvironment &&
  window.matchMedia("(pointer:fine)").matches
) {

  labEnvironment.addEventListener(
    "pointermove",
    (event) => {

      const rect =
        labEnvironment.getBoundingClientRect();


      const x =
        (event.clientX - rect.left)
        / rect.width - 0.5;


      const y =
        (event.clientY - rect.top)
        / rect.height - 0.5;


      const nodes =
        labEnvironment.querySelectorAll(
          ".lab-node"
        );


      nodes.forEach((node, index) => {

        const movement =
          (index + 1) * 3;


        node.style.transform =
          `translate(
            ${x * movement}px,
            ${y * movement}px
          )`;

      });

    }
  );


  labEnvironment.addEventListener(
    "pointerleave",
    () => {

      labEnvironment
        .querySelectorAll(".lab-node")
        .forEach((node) => {

          node.style.transform = "";

        });

    }
  );

}


/* ================= MOBILE MENU ================= */

const mobileMenu =
  document.getElementById("mobileMenu");

const navLinks =
  document.querySelector(".nav-links");


if (mobileMenu) {

  mobileMenu.addEventListener("click", () => {

    navLinks.classList.toggle("mobile-open");

  });

}


/* ================= ACTIVE SECTION ================= */

const sections =
  document.querySelectorAll(
    "section[id]"
  );


const navigationLinks =
  document.querySelectorAll(
    ".nav-links a"
  );


window.addEventListener("scroll", () => {

  let current = "";


  sections.forEach((section) => {

    const sectionTop =
      section.offsetTop - 150;


    if (
      window.scrollY >= sectionTop
    ) {

      current =
        section.getAttribute("id");

    }

  });


  navigationLinks.forEach((link) => {

    link.classList.remove("active");


    if (
      link.getAttribute("href") ===
      "#" + current
    ) {

      link.classList.add("active");

    }

  });

});