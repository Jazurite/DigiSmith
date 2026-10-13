#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <IOKit/IOKitLib.h>
typedef struct { uint8_t major, minor, build, reserved; uint16_t release; } Ver;
typedef struct { uint16_t version, length; uint32_t cpuPLimit, gpuPLimit, memPLimit; } PL;
typedef struct { uint32_t dataSize, dataType; uint8_t dataAttributes; } KI;
typedef struct { uint32_t key; Ver vers; PL pl; KI ki; uint8_t result, status, data8; uint32_t data32; uint8_t bytes[32]; } P;
static kern_return_t call(io_connect_t c, P *in, P *out){ size_t n=sizeof(P); return IOConnectCallStructMethod(c,2,in,sizeof(P),out,&n); }
static uint32_t k4(const char*s){return (s[0]<<24)|(s[1]<<16)|(s[2]<<8)|s[3];}
int main(int argc,char**argv){
  io_service_t s=IOServiceGetMatchingService(0,IOServiceMatching("AppleSMC")); if(!s){puts("no AppleSMC");return 1;}
  io_connect_t c; kern_return_t r=IOServiceOpen(s,mach_task_self(),0,&c); printf("open=%d\n",r); if(r)return 1;
  for(int i=1;i<argc;i++){
    P in,out; memset(&in,0,sizeof in); memset(&out,0,sizeof out);
    in.key=k4(argv[i]); in.data8=9; r=call(c,&in,&out); if(r||out.result){printf("%s info fail r=%d res=%d\n",argv[i],r,out.result);continue;}
    uint32_t sz=out.ki.dataSize, ty=out.ki.dataType; in.ki.dataSize=sz; in.data8=5; memset(&out,0,sizeof out); r=call(c,&in,&out);
    char t[5]={ty>>24,ty>>16,ty>>8,ty,0}; printf("%s type=%s size=%u raw=",argv[i],t,sz); for(uint32_t b=0;b<sz;b++)printf("%02x",out.bytes[b]);
    if(!strcmp(t,"sp78")) printf("  => %.2f C",(int8_t)out.bytes[0]+out.bytes[1]/256.0);
    if(!strcmp(t,"fpe2")) printf("  => %.1f rpm",((out.bytes[0]<<8)|out.bytes[1])/4.0);
    if(!strcmp(t,"flt ")){float f;memcpy(&f,out.bytes,4);printf("  => %.2f",f);}
    puts("");
  }
  return 0; }
