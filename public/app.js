const statusNode = document.querySelector("#status");
const cardsNode = document.querySelector("#cards");
const dateLabelNode = document.querySelector("#date-label");
const cardTemplate = document.querySelector("#card-template");

loadLunches();

async function loadLunches() {
  try {
    const response = await fetch("/api/lunches", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Palvelin vastasi virhekoodilla ${response.status}.`);
    }

    const data = await response.json();
    render(data);
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : "Lounaslistojen haku epäonnistui.";
    statusNode.dataset.variant = "error";
  }
}

function render(data) {
  dateLabelNode.textContent = data.date;
  cardsNode.replaceChildren();

  if (data.isWeekend) {
    statusNode.hidden = false;
    statusNode.textContent = "Viikonloppuna lounaslistoja ei haeta.";
    statusNode.dataset.variant = "muted";
  } else {
    statusNode.hidden = true;
    statusNode.textContent = "";
    statusNode.dataset.variant = "";
  }

  for (const restaurant of data.restaurants) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const title = card.querySelector(".restaurant-name");
    const link = card.querySelector(".restaurant-link");
    const badge = card.querySelector(".badge");
    const menuList = card.querySelector(".menu-list");
    const errorNode = card.querySelector(".error-text");

    title.textContent = restaurant.name;
    link.href = restaurant.url;
    badge.hidden = true;

    if (restaurant.error) {
      badge.hidden = false;
      badge.textContent = "Virhe";
      badge.dataset.variant = "error";
      errorNode.hidden = false;
      errorNode.textContent = restaurant.error;
    } else {
      for (const item of restaurant.items) {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        menuList.append(listItem);
      }
    }

    cardsNode.append(card);
  }
}
