const P = '/home/user/Racing-Game';
export default ({
  root: '/tmp/claude-0/-home-user-Racing-Game/e528ae30-2b2e-546e-81b7-5847d9636f10/scratchpad/cars-v4',
  resolve: { alias: [
    { find: /^three\/addons\/(.*)$/, replacement: P + '/node_modules/three/examples/jsm/$1' },
    { find: /^three$/, replacement: P + '/node_modules/three/build/three.module.js' },
  ] },
  server: { fs: { allow: [P, '/tmp/claude-0/-home-user-Racing-Game/e528ae30-2b2e-546e-81b7-5847d9636f10/scratchpad/cars-v4'] } },
});
