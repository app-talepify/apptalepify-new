#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"TalepifyApp";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];
  // Match LaunchScreen crimson to avoid dark/black flash between launch and first RN frame
  @try {
    if (self.window != nil) {
      self.window.backgroundColor = [UIColor colorWithRed:(220.0/255.0) green:(20.0/255.0) blue:(60.0/255.0) alpha:1.0];
      if (self.window.rootViewController != nil) {
        self.window.rootViewController.view.backgroundColor = [UIColor colorWithRed:(220.0/255.0) green:(20.0/255.0) blue:(60.0/255.0) alpha:1.0];
      }
    }
  } @catch(NSException *exception) {
    // no-op
  }
  return result;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
