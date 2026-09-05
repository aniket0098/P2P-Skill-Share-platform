/* =========================================================
   SKILLSHARE — PROFILE PAGE JS
   Anonymous
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* =====================================================
     ELEMENTS
  ====================================================== */

  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  const followBtn = document.getElementById("followBtn");
  const messageBtn = document.getElementById("messageBtn");
  const shareBtn = document.getElementById("shareBtn");
  const editBtn = document.getElementById("editBtn");

  const editModal = document.getElementById("editModal");
  const saveProfile = document.getElementById("saveProfile");

  const nameInput = document.getElementById("nameInput");
  const bioInput = document.getElementById("bioInput");

  const nameHeading = document.querySelector(".name-row h1");
  const bioText = document.getElementById("aboutText");
  const heroBio = document.querySelector(".bio");

  const toast = document.getElementById("toast");

  const activityFilter =
    document.getElementById("activityFilter");

  const activityItems =
    document.querySelectorAll(".activity-item");

  const skillTags =
    document.getElementById("skillTags");

  const notificationBtn =
    document.getElementById("notificationBtn");


  /* =====================================================
     TOAST SYSTEM
  ====================================================== */

  let toastTimer;

  function showToast(message) {

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2600);
  }


  /* =====================================================
     TAB SYSTEM
  ====================================================== */

  function openTab(tabName) {

    tabs.forEach(tab => {

      tab.classList.toggle(
        "active",
        tab.dataset.tab === tabName
      );

    });


    panels.forEach(panel => {

      panel.classList.toggle(
        "active",
        panel.id === tabName
      );

    });


    history.replaceState(
      null,
      "",
      `#${tabName}`
    );

  }


  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      const tabName =
        tab.dataset.tab;

      openTab(tabName);

    });

  });


  /* =====================================================
     OPEN TAB FROM OTHER BUTTONS
  ====================================================== */

  document
    .querySelectorAll("[data-tab-jump]")
    .forEach(button => {

      button.addEventListener("click", () => {

        openTab(
          button.dataset.tabJump
        );

        window.scrollTo({
          top:
            document.querySelector(
              ".profile-tabs"
            ).offsetTop - 80,

          behavior: "smooth"
        });

      });

    });


  /* =====================================================
     RESTORE TAB FROM URL
  ====================================================== */

  const hash =
    window.location.hash.replace("#", "");

  if (
    hash &&
    document.getElementById(hash) &&
    document.querySelector(
      `.tab[data-tab="${hash}"]`
    )
  ) {

    openTab(hash);

  }


  /* =====================================================
     FOLLOW BUTTON
  ====================================================== */

  if (followBtn) {

    followBtn.addEventListener("click", () => {

      const following =
        followBtn.classList.toggle(
          "following"
        );


      if (following) {

        followBtn.textContent =
          "✓ Following";

        showToast(
          "You are now following Anonymous."
        );

      } else {

        followBtn.textContent =
          "+ Follow";

        showToast(
          "You unfollowed Anonymous."
        );

      }

    });

  }


  /* =====================================================
     MESSAGE BUTTON
  ====================================================== */

  if (messageBtn) {

    messageBtn.addEventListener("click", () => {

      /*
       * Change this filename if your
       * messaging page uses another name.
       */

      window.location.href =
        "messages.html";

    });

  }


  /* =====================================================
     SHARE PROFILE
  ====================================================== */

  if (shareBtn) {

    shareBtn.addEventListener(
      "click",
      async () => {

        const profileUrl =
          window.location.href;

        const shareData = {

          title:
            "Anonymous | SkillShare",

          text:
            "Check out Anonymous's profile on SkillShare.",

          url:
            profileUrl

        };


        try {

          if (
            navigator.share
          ) {

            await navigator.share(
              shareData
            );

            showToast(
              "Profile shared successfully."
            );

          } else if (
            navigator.clipboard
          ) {

            await navigator.clipboard
              .writeText(
                profileUrl
              );

            showToast(
              "Profile link copied."
            );

          } else {

            showToast(
              "Copy this page URL to share the profile."
            );

          }

        } catch (error) {

          /*
           * User may simply have
           * closed the share dialog.
           */

          if (
            error.name !==
            "AbortError"
          ) {

            showToast(
              "Unable to share right now."
            );

          }

        }

      }
    );

  }


  /* =====================================================
     EDIT PROFILE MODAL
  ====================================================== */

  function openEditModal() {

    if (!editModal) return;

    editModal.classList.add("open");

    editModal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.style.overflow =
      "hidden";

  }


  function closeEditModal() {

    if (!editModal) return;

    editModal.classList.remove("open");

    editModal.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.style.overflow =
      "";

  }


  if (editBtn) {

    editBtn.addEventListener(
      "click",
      openEditModal
    );

  }


  document
    .querySelectorAll(".close-modal")
    .forEach(button => {

      button.addEventListener(
        "click",
        closeEditModal
      );

    });


  /* =====================================================
     CLOSE MODAL WHEN CLICKING OUTSIDE
  ====================================================== */

  if (editModal) {

    editModal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          editModal
        ) {

          closeEditModal();

        }

      }
    );

  }


  /* =====================================================
     ESCAPE KEY
  ====================================================== */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape" &&
        editModal?.classList.contains(
          "open"
        )
      ) {

        closeEditModal();

      }

    }
  );


  /* =====================================================
     SAVE PROFILE
  ====================================================== */

  if (saveProfile) {

    saveProfile.addEventListener(
      "click",
      () => {

        const newName =
          nameInput.value.trim();

        const newBio =
          bioInput.value.trim();


        if (!newName) {

          showToast(
            "Please enter your name."
          );

          nameInput.focus();

          return;

        }


        if (!newBio) {

          showToast(
            "Please enter a short bio."
          );

          bioInput.focus();

          return;

        }


        if (nameHeading) {

          nameHeading.textContent =
            newName;

        }


        if (bioText) {

          bioText.textContent =
            newBio;

        }


        if (heroBio) {

          heroBio.textContent =
            newBio;

        }


        localStorage.setItem(
          "skillshare_profile_name",
          newName
        );

        localStorage.setItem(
          "skillshare_profile_bio",
          newBio
        );


        closeEditModal();

        showToast(
          "Profile updated successfully."
        );

      }
    );

  }


  /* =====================================================
     LOAD SAVED PROFILE
  ====================================================== */

  const savedName =
    localStorage.getItem(
      "skillshare_profile_name"
    );

  const savedBio =
    localStorage.getItem(
      "skillshare_profile_bio"
    );


  if (
    savedName &&
    nameHeading
  ) {

    nameHeading.textContent =
      savedName;

    if (nameInput) {

      nameInput.value =
        savedName;

    }

  }


  if (savedBio) {

    if (bioText) {

      bioText.textContent =
        savedBio;

    }

    if (heroBio) {

      heroBio.textContent =
        savedBio;

    }

    if (bioInput) {

      bioInput.value =
        savedBio;

    }

  }


  /* =====================================================
     ABOUT EDIT BUTTON
  ====================================================== */

  const aboutEdit =
    document.getElementById(
      "aboutEdit"
    );

  if (aboutEdit) {

    aboutEdit.addEventListener(
      "click",
      openEditModal
    );

  }


  /* =====================================================
     ACHIEVEMENT BUTTONS
  ====================================================== */

  document
    .querySelectorAll(".achievement")
    .forEach(achievement => {

      achievement.addEventListener(
        "click",
        () => {

          const title =
            achievement.dataset
              .achievement ||
            "Achievement";

          showToast(
            `${title} unlocked!`
          );

        }
      );

    });


  const achievementsBtn =
    document.getElementById(
      "achievementsBtn"
    );

  if (achievementsBtn) {

    achievementsBtn.addEventListener(
      "click",
      () => {

        showToast(
          "More achievements will appear here."
        );

      }
    );

  }


  /* =====================================================
     ADD SKILL
  ====================================================== */

  const addSkillBtn =
    document.getElementById(
      "addSkillBtn"
    );

  if (addSkillBtn) {

    addSkillBtn.addEventListener(
      "click",
      () => {

        const skill =
          prompt(
            "Enter a new skill:"
          );


        if (!skill) return;


        const cleanSkill =
          skill.trim();


        if (!cleanSkill) return;


        const existing =
          [...skillTags.children]
            .some(
              tag =>
                tag.textContent
                  .trim()
                  .toLowerCase() ===
                cleanSkill.toLowerCase()
            );


        if (existing) {

          showToast(
            "This skill already exists."
          );

          return;

        }


        const tag =
          document.createElement(
            "span"
          );

        tag.textContent =
          cleanSkill;


        skillTags.appendChild(tag);


        saveSkill(cleanSkill);


        showToast(
          `${cleanSkill} added to your skills.`
        );

      }
    );

  }


  /* =====================================================
     SAVE CUSTOM SKILLS
  ====================================================== */

  function saveSkill(skill) {

    const skills =
      JSON.parse(
        localStorage.getItem(
          "skillshare_custom_skills"
        ) || "[]"
      );


    if (
      !skills.some(
        item =>
          item.toLowerCase() ===
          skill.toLowerCase()
      )
    ) {

      skills.push(skill);

      localStorage.setItem(
        "skillshare_custom_skills",
        JSON.stringify(skills)
      );

    }

  }


  /* =====================================================
     LOAD CUSTOM SKILLS
  ====================================================== */

  const savedSkills =
    JSON.parse(
      localStorage.getItem(
        "skillshare_custom_skills"
      ) || "[]"
    );


  if (skillTags) {

    savedSkills.forEach(skill => {

      const exists =
        [...skillTags.children]
          .some(
            tag =>
              tag.textContent
                .trim()
                .toLowerCase() ===
              skill.toLowerCase()
          );


      if (!exists) {

        const tag =
          document.createElement(
            "span"
          );

        tag.textContent =
          skill;

        skillTags.appendChild(tag);

      }

    });

  }


  /* =====================================================
     ACTIVITY FILTER
  ====================================================== */

  if (activityFilter) {

    activityFilter.addEventListener(
      "change",
      () => {

        const selected =
          activityFilter.value;


        activityItems.forEach(item => {

          const type =
            item.dataset.type;


          if (
            selected === "all" ||
            selected === type
          ) {

            item.style.display =
              "flex";

          } else {

            item.style.display =
              "none";

          }

        });

      }
    );

  }


  /* =====================================================
     SESSION JOIN BUTTONS
  ====================================================== */

  document
    .querySelectorAll(".join-btn")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const original =
            button.textContent;

          button.textContent =
            "Joined ✓";

          button.disabled =
            true;

          showToast(
            "You've joined the session."
          );


          setTimeout(() => {

            button.disabled =
              false;

            button.textContent =
              original;

          }, 3000);

        }
      );

    });


  /* =====================================================
     NOTIFICATION BUTTON
  ====================================================== */

  if (notificationBtn) {

    notificationBtn.addEventListener(
      "click",
      () => {

        showToast(
          "You have 3 new notifications."
        );

      }
    );

  }


  /* =====================================================
     STAT COUNTER ANIMATION
  ====================================================== */

  const counters =
    document.querySelectorAll(
      "[data-count]"
    );


  function animateCounter(element) {

    const target =
      parseFloat(
        element.dataset.count
      );


    const duration =
      1000;

    const start =
      performance.now();


    function update(currentTime) {

      const progress =
        Math.min(
          (currentTime - start) /
          duration,
          1
        );


      const eased =
        1 -
        Math.pow(
          1 - progress,
          3
        );


      const value =
        target * eased;


      if (
        target % 1 !== 0
      ) {

        element.textContent =
          value.toFixed(1);

      } else if (
        target >= 1000
      ) {

        element.textContent =
          Math.floor(
            value
          ).toLocaleString();

      } else {

        element.textContent =
          Math.floor(value);

      }


      if (progress < 1) {

        requestAnimationFrame(
          update
        );

      }

    }


    requestAnimationFrame(update);

  }


  /* =====================================================
     INTERSECTION OBSERVER
  ====================================================== */

  if (
    "IntersectionObserver"
    in window
  ) {

    const statsObserver =
      new IntersectionObserver(
        entries => {

          entries.forEach(
            entry => {

              if (
                entry.isIntersecting
              ) {

                counters.forEach(
                  counter => {

                    if (
                      !counter
                        .dataset
                        .animated
                    ) {

                      counter
                        .dataset
                        .animated =
                        "true";

                      animateCounter(
                        counter
                      );

                    }

                  }
                );


                statsObserver
                  .disconnect();

              }

            }
          );

        },
        {
          threshold: 0.3
        }
      );


    const stats =
      document.querySelector(
        ".quick-stats"
      );


    if (stats) {

      statsObserver.observe(stats);

    }

  } else {

    counters.forEach(
      animateCounter
    );

  }


  /* =====================================================
     CARD REVEAL EFFECT
  ====================================================== */

  const cards =
    document.querySelectorAll(
      ".panel-card"
    );


  if (
    "IntersectionObserver"
    in window
  ) {

    const cardObserver =
      new IntersectionObserver(
        entries => {

          entries.forEach(
            entry => {

              if (
                entry.isIntersecting
              ) {

                entry.target.style.opacity =
                  "1";

                entry.target.style.transform =
                  "translateY(0)";

                cardObserver
                  .unobserve(
                    entry.target
                  );

              }

            }
          );

        },
        {
          threshold: 0.08
        }
      );


    cards.forEach(card => {

      card.style.opacity = "0";

      card.style.transform =
        "translateY(10px)";

      card.style.transition =
        "opacity .45s ease, transform .45s ease";


      cardObserver.observe(card);

    });

  }


  /* =====================================================
     KEYBOARD SHORTCUTS
  ====================================================== */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }


      const shortcuts = {

        "1": "overview",
        "2": "skills",
        "3": "sessions",
        "4": "activity"

      };


      if (
        shortcuts[event.key]
      ) {

        openTab(
          shortcuts[event.key]
        );

      }

    }
  );


  /* =====================================================
     REAL USER PROFILE (FastAPI + PostgreSQL)
     profile.html?id=123 loads that user's real data. Without
     an id, the page stays on the local profile view.
  ====================================================== */

  (async function loadRealProfile() {

    const params = new URLSearchParams(window.location.search);
    const profileId = parseInt(params.get("id"), 10);

    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
      /* Visitors without a session are not shown user profile data,
         but the page itself remains usable. */
      return;
    }

    const API = window.SkillShareAPI;
    const me = API.getUser();

    /* Helper: put the public ID on the profile when we know the user. */
    function setPublicId(publicId) {
      const el = document.getElementById("profilePublicId");
      if (el) el.textContent = publicId ? `User ID: ${publicId}` : "User ID: —";
    }

    /* Own profile (with or without ?id=self): fetch /me for the ID. */
    if (!profileId || (me && Number(me.id) === profileId)) {
      try {
        const data = await API.getMe();
        const user = (data && data.user) || null;
        if (user) {
          const heading = document.querySelector(".name-row h1");
          if (heading) heading.textContent = user.name || "My Profile";
          setPublicId(user.public_id);
        }
      } catch (error) {
        setPublicId(null);
      }
      return;
    }

    try {

      const data = await API.getUserProfile(profileId);
      const user = (data && data.user) || null;
      const rel = (data && data.relationship) || {};

      if (!user) return;

      const heading = document.querySelector(".name-row h1");
      if (heading) heading.textContent = user.name || "SkillShare user";
      setPublicId(user.public_id);

      const bioParagraph = document.querySelector(".bio");
      const about = document.getElementById("aboutText");
      if (user.bio) {
        if (bioParagraph) bioParagraph.textContent = user.bio;
        if (about) about.textContent = user.bio;
      }

      const tags = document.getElementById("skillTags");
      if (tags) {
        tags.innerHTML = "";
        const list = String(user.skills || user.interests || "")
          .split(",").map(s => s.trim()).filter(Boolean);
        if (list.length) {
          list.forEach(skill => {
            const span = document.createElement("span");
            span.className = "tag";
            span.textContent = skill;
            tags.appendChild(span);
          });
        } else {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = "New member";
          tags.appendChild(span);
        }
      }

      const follow = document.getElementById("followBtn");
      const message = document.getElementById("messageBtn");
      const share = document.getElementById("shareBtn");
      const edit = document.getElementById("editBtn");
      if (edit) edit.style.display = "none";

      /* Action buttons reflect the real relationship state. */
      if (rel.connected) {
        if (follow) {
          follow.textContent = "✓ Connected";
          follow.disabled = true;
        }
        if (message) {
          message.addEventListener("click", () => {
            window.location.href = "messages.html";
          });
        }
      } else if (rel.pending_direction === "sent") {
        if (follow) {
          follow.textContent = "Request Pending";
          follow.disabled = true;
        }
        if (message) {
          message.addEventListener("click", () => {
            showToast("You can message once you are connected.");
          });
        }
      } else if (rel.pending_direction === "received") {
        if (follow) {
          follow.textContent = "Respond in Requests";
          follow.addEventListener("click", () => {
            window.location.href = "requests.html";
          });
        }
        if (message) {
          message.addEventListener("click", () => {
            showToast("You can message once you are connected.");
          });
        }
      } else {
        if (follow) {
          follow.textContent = "+ Send Request";
          follow.addEventListener("click", async () => {
            follow.disabled = true;
            follow.textContent = "Sending...";
            try {
              await API.sendRequest(profileId, "I'd love to connect and learn together!");
              follow.textContent = "Request Sent ✓";
              showToast("Request sent to " + (user.name || "them") + ".");
            } catch (error) {
              follow.disabled = false;
              follow.textContent = "+ Send Request";
              showToast(error && error.detail
                ? error.detail
                : "Unable to send the request. Please try again.");
            }
          });
        }
        if (message) {
          message.addEventListener("click", () => {
            showToast("You need to be connected before messaging this user.");
          });
        }
      }

      if (share) share.addEventListener("click", () => {
        showToast("Profile: " + (user.name || ""));
      });

    } catch (error) {
      if (error && error.status === 404) {
        showToast("User not found.");
      } else if (error && error.status === 401) {
        window.location.href = "login.html";
      }
    }
  })();


  /* =====================================================
     PROFILE READY
  ====================================================== */

  document.body.classList.add(
    "profile-ready"
  );

});