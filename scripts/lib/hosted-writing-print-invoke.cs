// Disposable hosted integration test only. No product handler or DOM input.
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Automation;
public sealed class HostedWritingPrintInvocation {
 public volatile bool Started,Completed;
 public volatile string Error;
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public static HostedWritingPrintInvocation Begin(string executable,long handle,int expectedPid,string buttonName){
  if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true"||Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT")!="github-hosted"||Environment.GetEnvironmentVariable("RUNNER_OS")!="Windows"||Environment.GetEnvironmentVariable("LONGEDIT_R5I_DISPOSABLE")!="1")throw new InvalidOperationException("Hosted disposable test only");
  if(buttonName!="Print"&&buttonName!="Save"&&buttonName!="打印"&&buttonName!="保存")throw new ArgumentException("Exact print action required");
  var result=new HostedWritingPrintInvocation();
  var worker=new Thread(delegate(){try{
   uint pid;GetWindowThreadProcessId(new IntPtr(handle),out pid);
   if(pid!=expectedPid||!String.Equals(Path.GetFullPath(Process.GetProcessById(expectedPid).MainModule.FileName),Path.GetFullPath(executable),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Owned print window identity changed");
   var root=AutomationElement.FromHandle(new IntPtr(handle));
   var buttons=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button),new PropertyCondition(AutomationElement.NameProperty,buttonName),new PropertyCondition(AutomationElement.IsEnabledProperty,true)));
   var cancel=root.FindFirst(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button),new OrCondition(new PropertyCondition(AutomationElement.NameProperty,"Cancel"),new PropertyCondition(AutomationElement.NameProperty,"取消"))));
   if(buttons.Count!=1||cancel==null)throw new InvalidOperationException("A unique enabled action in the real print UI is required");
   result.Started=true;((InvokePattern)buttons[0].GetCurrentPattern(InvokePattern.Pattern)).Invoke();
  }catch(Exception error){result.Error=error.ToString();}finally{result.Completed=true;}});
  worker.IsBackground=true;worker.SetApartmentState(ApartmentState.MTA);worker.Start();return result;
 }
}
