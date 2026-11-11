---
title: Start Here
---

# Start Here

Welcome to Nolheim. If you are new to this world, the amount of information can be overwhelming. This page is designed to guide you through the most important concepts and conflicts, starting from the broadest picture and narrowing down to specific people and organizations.

## 1. Understand the World

Before diving into the politics, it helps to understand the geography and the forces that shaped it.

*   **[Kingdom of the Ai'ron Land](/locations/countries/ironland)**: The established, constitutional monarchy that serves as the anchor of the region.
*   **[Ironclad](/km/locations/countries/ironclad)**: The ungoverned frontier. This is not a state, but a demilitarized zone ruled by competing warlords.
*   **[VISTA](/km/factions/vista)**: The intergovernmental military organization that binds the region together, though often through deadlock.

## 2. Understand the Conflict

The year is 2008, and the region is on the brink of war. At the heart of the conflict is a clash between an institutional order and a decentralized insurgency.

*   **[Konish Kimbotin](/characters/lendermaire/konish-kimbotin-(reimagined))**: The Cladish warlord who leads the insurgency.
*   **[Konish's Group](/km/factions/konish's-group)**: The coalition of autonomous militias that Kimbotin has united.
*   **[LENDERMAIRE](/km/factions/lendermaire)**: The black operations unit that serves as Kimbotin's most dangerous weapon.

## 3. Explore the People

Once you understand the factions, you can explore the individuals who drive the story forward.

*   **[Samsara Lykor](/km/characters/samsara-lykor)**: The concealed thirteenth member of LENDERMAIRE, a man torn between his past and his loyalty.
*   **[Northrad](/characters/vista/noradus)**: The President of VISTA and the architect of the institutions that oppose Kimbotin.
*   **[2008 Pocheasang Palace raid](/km/events/2008-pocheasang-palace-raid)**: The event that sparked the modern conflict.

---

<div class="portal-grid"><a href="#" class="portal-button" onclick="const h=JSON.parse(sessionStorage.getItem('randomHistory')||'[]');fetch('random-index.json').then(r=>r.json()).then(idx=>{let pool=idx.filter(u=>!h.includes(u));if(!pool.length){h.length=0;pool=idx;}const p=pool[Math.floor(Math.random()*pool.length)];h.push(p);if(h.length>10)h.shift();sessionStorage.setItem('randomHistory',JSON.stringify(h));window.location.href=p;});return false;">Surprise Me</a></div>
