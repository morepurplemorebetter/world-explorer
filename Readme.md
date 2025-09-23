# World Explorer

A Foundry VTT module for hexcrawl campaigns that gives you full control of what your party discovers on the map. This module creates a second manual fog of war—with color or image—which you can reveal one grid space at a time. Grid spaces can be revealed in full or in part, and while the GM can always do this manually, you can also auto-reveal areas explored by friendly tokens.

This second fog of war displays over the background but below the tokens, showing the party while exploring uncharted territory. You can choose whether or not this layer covers tiles, or even tokens—for games that would prefer to treat it as a manual grid based fog of war.

If you're feeling generous, you can send something through [Paypal](https://paypal.me/carlosfernandez1779?locale.x=en_US) if you want.

# Features

## Scene Settings & Canvas Tools

<img src="images/screenshot-world-explorer-scene-settings.webp" title="World Explorer tab in the scene setting" width="50%" align="left">
<img src="images/screenshot-world-explorer-tools.webp" title="World Explorer canvas control tools" width="40%" align="right">
<br clear="right"/>
<sub><br>Scene setting tab (left) and <br>Canvas control tools (right)</sub>
<br clear="both"/>
<br>

Enable this module for a scene in the scene's configuration. Once enabled, a tool button will be available in the canvas controls to the left. With those, you can either edit the map in toggle mode (where you hide/reveal grid spaces one at time) or in reveal, partial, or hide modes. You can also quickly change the opacity for the GM and reset the entire map (hiding or revealing everything).

## Separate Gamemaster and Player Opacities

<img src="images/screenshot-world-explorer-gm-view.webp" title="Gamemaster view of the scene with World Explorer enabled" width="46%" align="left">
<img src="images/screenshot-world-explorer-player-view.webp" title="Player view of the scene with World Explorer enabled" width="46%" align="right">
<br clear="both"/>
<p align="center"><sub>Gamemaster view (left) and player view (right) of the scene with World Explorer enabled</sub></p>

By default, the GM has 70% opacity and players have 100% opacity. While the GM can see what's underneath, the view is completely blocked for players unless you set it otherwise. The GM can quickly change their own opacity from the canvas controls whenever they want.

## Partially Revealed Spaces

Optionally, you can mark spaces as being partially revealed using the World Explorer canvas tools to the left. These spaces have their own color and opacity that you can set (40% by default). You can use it, for example, to mark stuff on the map that players know about but haven't visited.

## Automatic Revealing

While the module expects a manual approach, you can optionally set the module to automatically reveal spaces that players have ventured through. It only performs these updates for tokens that have a player owner. Tokens used to represent wandering encounters won't get revealed to players.

&nbsp;

# Credits

* Thanks to [morepurplemorebetter](https://github.com/morepurplemorebetter/) for implementing partially revealed tiles as well as certain optimizations and fixes
