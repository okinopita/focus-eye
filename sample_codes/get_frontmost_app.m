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

        NSDictionary *out = @{
            @"appDisplayName": appDisplayName,
            @"appExecutable": appExecutable
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
            printf("%s\t%s\n", disp, exec);
        }
    }
    return 0;
}
