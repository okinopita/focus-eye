// Objective-C helper to print JSON with frontmost application's display name,
// executable path, and front window title.
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

int main(int argc, char *argv[]) {
    @autoreleasepool {
        NSRunningApplication *front = [NSWorkspace sharedWorkspace].frontmostApplication;
        if (!front) {
            return 0;
        }

        NSString *appDisplayName = front.localizedName ?: @"";
        NSString *appExecutable = nil;
        if (front.executableURL) {
            appExecutable = front.executableURL.path;
        } else if (front.bundleURL) {
            appExecutable = front.bundleURL.path;
        } else {
            appExecutable = @"";
        }

        // Find a window title for this app via CGWindowList
        pid_t pid = front.processIdentifier;
        NSString *windowTitle = @"";

        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
        if (windowList) {
            NSArray *arr = CFBridgingRelease(windowList);
            for (NSDictionary *entry in arr) {
                NSNumber *ownerPID = entry[(id)kCGWindowOwnerPID];
                if (!ownerPID) continue;
                if ((pid_t)[ownerPID intValue] != pid) continue;
                // prefer windows with a name / title and layer 0
                NSString *name = entry[(id)kCGWindowName];
                NSNumber *layer = entry[(id)kCGWindowLayer];
                if (name && [name length] > 0) {
                    // if layer exists, prefer layer == 0
                    if (!layer || [layer intValue] == 0) {
                        windowTitle = name;
                        break;
                    }
                    // otherwise keep first name if no better found
                    if ([windowTitle length] == 0) {
                        windowTitle = name;
                    }
                }
            }
        }

        NSDictionary *out = @{
            @"appDisplayName": appDisplayName,
            @"appExecutable": appExecutable,
            @"browsing": windowTitle
        };

        NSError *err = nil;
        NSData *json = [NSJSONSerialization dataWithJSONObject:out options:0 error:&err];
        if (json && !err) {
            NSString *s = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
            if (s) {
                printf("%s\n", [s UTF8String]);
            }
        } else {
            // Fallback: print minimal fields separated by tabs
            const char *disp = [appDisplayName UTF8String] ?: "";
            const char *exec = [appExecutable UTF8String] ?: "";
            const char *win = [windowTitle UTF8String] ?: "";
            printf("%s\t%s\t%s\n", disp, exec, win);
        }
    }
    return 0;
}
