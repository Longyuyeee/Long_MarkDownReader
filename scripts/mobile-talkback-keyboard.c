// Test-only real keyboard events for TalkBack on a dedicated rooted emulator.
#include <fcntl.h>
#include <linux/input.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
static int keyboard;
static int event(int type, int code, int value) {
  struct input_event e = {0}; e.type = type; e.code = code; e.value = value;
  return write(keyboard, &e, sizeof(e)) == sizeof(e);
}
int main(int argc, char **argv) {
  if (argc != 3 || getuid() != 0) return 2;
  if (strcmp(argv[2], "/dev/input/event1") && strcmp(argv[2], "/dev/input/event12")) return 2;
  int key;
  if (!strcmp(argv[1], "next")) key = KEY_RIGHT;
  else if (!strcmp(argv[1], "previous")) key = KEY_LEFT;
  else if (!strcmp(argv[1], "activate")) key = KEY_ENTER;
  else return 2;
  keyboard = open(argv[2], O_WRONLY);
  if (keyboard < 0) { perror("test keyboard"); return 1; }
  int ok = event(EV_KEY, KEY_LEFTALT, 1) && event(EV_SYN, SYN_REPORT, 0);
  usleep(20000);
  ok &= event(EV_KEY, key, 1) && event(EV_SYN, SYN_REPORT, 0);
  usleep(20000);
  ok &= event(EV_KEY, key, 0); ok &= event(EV_KEY, KEY_LEFTALT, 0);
  ok &= event(EV_SYN, SYN_REPORT, 0);
  close(keyboard); return ok ? 0 : 1;
}
