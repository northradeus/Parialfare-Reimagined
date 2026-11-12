---
title: Nolheim
description: "The Independent Encyclopedia of Parialfare: Reimagined — covert operations, warlords, and black-site facilities in the year 2008."
socialImage: og-image.png
---
<div class="home-hero"><h1 class="hero-title">NOLHEIM</h1><p class="hero-subtitle">The Independent Encyclopedia of Parialfare: Reimagined</p><p class="hero-author">Created by <a href="https://northrad.carrd.co/" target="_blank" rel="noopener">CHHUM PICHTHYACHHANAN</a></p><p class="hero-lead"><strong>"A household of people every institution threw away becomes the one thing a superpower cannot buy back."</strong><br/>The year is 2008. The world is dominated by a technology race and an information war, fought through covert operations, contractors, and black-site facilities rather than open conventional war. The most powerful figures in the region are not states, but warlords, intelligence agencies, and private military companies.</p></div>

<h2 class="home-section-title">Explore the Archive</h2>
<div class="portal-grid"><a href="portal---characters" class="portal-button">01. Personnel</a><a href="portal---factions" class="portal-button">02. Organizations</a><a href="portal---locations" class="portal-button">03. Geography</a><a href="portal---events" class="portal-button">04. Historical Log</a><a href="portal---lore" class="portal-button">05. Systems & Lore</a></div>
<div class="portal-grid" style="margin-top: 0.6rem;"><a href="incidents" class="portal-button" style="border-color: #a6535c; color: #a6535c; font-weight: 700;">★ Declassified Incident Archive (Incidents 001–003)</a></div>

<h2 class="home-section-title">Choose Your Side</h2>
<p class="home-section-subtitle">Two opposing doctrines dominate the 2008 southern continent. Select a faction to inspect their commanders, citadels, and frontline operators.</p>

<div class="side-selector">
  <input type="radio" id="side-insurgency" name="side-choice" checked />
  <input type="radio" id="side-order" name="side-choice" />

  <div class="side-tabs">
    <label for="side-insurgency" class="side-tab-btn tab-insurgency">
      <span class="tab-badge">FACTION // 01</span>
      <span class="tab-title">The Insurgency</span>
      <span class="tab-sub">Konish's Group & LENDERMAIRE</span>
    </label>
    <label for="side-order" class="side-tab-btn tab-order">
      <span class="tab-badge">FACTION // 02</span>
      <span class="tab-title">The Order</span>
      <span class="tab-sub">VISTA, New Aester & ITF</span>
    </label>
  </div>

  <div class="side-panel panel-insurgency">
    <div class="side-motto">"Let them taste steel." &mdash; The Cladish warlord coalition defending an unmapped interior.</div>
    <div class="featured-grid">
      <a href="characters/lendermaire/konish-kimbotin-(reimagined)" class="featured-card">
        <span class="card-image"><img src="assets/konish.jpg" alt="Konish Kimbotin" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-insurgent">COMMANDER</span>
          <span class="card-title">Konish Kimbotin</span>
          <span class="card-subtitle">Cladish-Jen warlord shielding the undocumented southern society.</span>
        </span>
      </a>
      <a href="locations/area-31" class="featured-card">
        <span class="card-image"><img src="assets/area-31.jpg" alt="Area-31 Citadel" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-insurgent">CITADEL</span>
          <span class="card-title">Area-31 (Shaiken)</span>
          <span class="card-subtitle">Brutalist mountain fortress and base for supersonic "Sun" interceptors.</span>
        </span>
      </a>
      <a href="characters/lendermaire/samsara-lykor" class="featured-card">
        <span class="card-image"><img src="assets/samsara.jpg" alt="Samsara Lykor" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-insurgent">SPECIAL OPERATOR</span>
          <span class="card-title">Samsara Lykor</span>
          <span class="card-subtitle">The concealed thirteenth member erased from all public records.</span>
        </span>
      </a>
    </div>
  </div>

  <div class="side-panel panel-order">
    <div class="side-motto">"Progress Through Innovation." &mdash; Corporate technocracy backed by private military contractor power.</div>
    <div class="featured-grid">
      <a href="characters/vista/noradus" class="featured-card">
        <span class="card-image"><img src="assets/naradus.png" alt="Noradus 'Northrad'" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-order">ARCHITECT</span>
          <span class="card-title">Noradus "Northrad"</span>
          <span class="card-subtitle">Billionaire VISTA President and founder of New Aester.</span>
        </span>
      </a>
      <a href="locations/countries/new-aester" class="featured-card">
        <span class="card-image"><img src="assets/newaester.png" alt="New Aester" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-order">CORPORATE STATE</span>
          <span class="card-title">New Aester</span>
          <span class="card-subtitle">Corporate proving ground city-state locked behind a brutalist defensive wall.</span>
        </span>
      </a>
      <a href="characters/anajak-forces/takahashi" class="featured-card">
        <span class="card-image"><img src="assets/sahara.jpg" alt="Takahashi 'Sahara'" loading="lazy"></span>
        <span class="card-content">
          <span class="card-badge badge-order">STRIKE PILOT</span>
          <span class="card-title">Takahashi ("Sahara")</span>
          <span class="card-subtitle">Thaiphonese strike aviator who inflicted LENDERMAIRE's first casualty.</span>
        </span>
      </a>
    </div>
  </div>
</div>

<h2 class="home-section-title">Not sure where to start?</h2>
<div class="portal-grid"><a href="start-here" class="portal-button">Start Here</a><a href="#" class="portal-button" onclick="const h=JSON.parse(sessionStorage.getItem('randomHistory')||'[]');fetch('random-index.json').then(r=>r.json()).then(idx=>{let pool=idx.filter(u=>!h.includes(u));if(!pool.length){h.length=0;pool=idx;}const p=pool[Math.floor(Math.random()*pool.length)];h.push(p);if(h.length>10)h.shift();sessionStorage.setItem('randomHistory',JSON.stringify(h));window.location.href=p;});return false;">Random Article</a></div>
