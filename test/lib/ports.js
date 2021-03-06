// @flow

const allocatedPorts = new Set();

module.exports.getRandomPort = () => {
  let randomPort;
  do {
    randomPort = 20000 + Math.round(Math.random() * 10000);
  } while (allocatedPorts.has(randomPort));
  allocatedPorts.add(randomPort);
  return randomPort;
};
