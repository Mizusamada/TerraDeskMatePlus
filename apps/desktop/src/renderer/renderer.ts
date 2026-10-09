import { initControl } from './control.js';
import { initPet } from './pet.js';
import { initEnemy } from './enemy.js';
if (document.body.dataset.view === 'pet') void initPet(); else if (document.body.dataset.view === 'enemy') void initEnemy(); else void initControl();
